import io
import time
import zipfile

CONTENT = """<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
  xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0">
  <office:body><office:text>
    <text:h>Cell biology</text:h>
    <text:p>Mitochondria<text:s text:c="2"/>make <text:span>ATP</text:span>.<text:note><text:note-body><text:p>footnote</text:p></text:note-body></text:note></text:p>
    <table:table><table:table-row>
      <table:table-cell><text:p>Organelle</text:p></table:table-cell>
      <table:table-cell><text:p>Role</text:p></table:table-cell>
    </table:table-row></table:table>
  </office:text></office:body>
</office:document-content>"""


def make_odt() -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("mimetype", "application/vnd.oasis.opendocument.text")
        archive.writestr("content.xml", CONTENT)
    return buffer.getvalue()


def test_odt_upload_extracts_text(client, auth_headers):
    upload = client.post("/api/documents", headers=auth_headers,
                         files={"file": ("cells.odt", make_odt(), "application/vnd.oasis.opendocument.text")})
    assert upload.status_code == 201
    document = upload.json()
    for _ in range(30):
        document = client.get(f"/api/documents/{document['id']}", headers=auth_headers).json()
        if document["status"] != "processing":
            break
        time.sleep(0.05)
    assert document["status"] == "ready", document
    text = client.get(f"/api/documents/{document['id']}/content", headers=auth_headers).json()["text"]
    assert "Cell biology" in text
    assert "Mitochondria  make ATP." in text
    assert "footnote" not in text
    assert "Organelle | Role" in text

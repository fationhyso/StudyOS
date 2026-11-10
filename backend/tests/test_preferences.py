def test_preferences_sync_per_account(client, auth_headers):
    assert client.get("/api/preferences", headers=auth_headers).json() == {}
    semester = {"name": "Fall 2026", "courses": ["Calculus II", "Biology"]}
    assert client.patch("/api/preferences/semester-courses", json={"value": semester}, headers=auth_headers).status_code == 200
    assert client.patch("/api/preferences/exam-period", json={"value": "2027-01-10"}, headers=auth_headers).status_code == 200
    assert client.get("/api/preferences", headers=auth_headers).json() == {"semester-courses": semester, "exam-period": "2027-01-10"}

    client.patch("/api/preferences/exam-period", json={"value": None}, headers=auth_headers)
    assert "exam-period" not in client.get("/api/preferences", headers=auth_headers).json()

    assert client.patch("/api/preferences/unknown", json={"value": 1}, headers=auth_headers).status_code == 404
    assert client.get("/api/preferences").status_code == 401

    other = client.post("/api/auth/signup", json={"name": "Grace", "email": "grace@example.com", "password": "correct-horse"})
    other_headers = {"Authorization": f"Bearer {other.json()['token']}"}
    assert client.get("/api/preferences", headers=other_headers).json() == {}

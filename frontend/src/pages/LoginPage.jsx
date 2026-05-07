import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { login } from "../api";
import { setSession } from "../auth";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await login(username, password);
      setSession(data);
      navigate("/");
    } catch (err) {
      setError(String(err.message || err));
    }
    setLoading(false);
  }

  return (
    <div className="loginPage">
      <form className="loginCard" onSubmit={onSubmit}>
        <img src="/logo.png" alt="E365" className="loginLogo" />
        <div className="loginTagline">
          <span className="t1">Innovate.</span>
          <span className="t1">Experience.</span>
          <span className="t2">Celebrate.</span>
        </div>
        <h1 style={{ textAlign: "center", marginTop: 4 }}>Sign In</h1>
        <p style={{ textAlign: "center" }}>Welcome back — log in to your E365 workspace</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
          <label className="fieldLabel" style={{ textTransform: "uppercase", letterSpacing: ".05em" }}>Username</label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter your username"
            autoComplete="username"
            required
          />
          <label className="fieldLabel" style={{ textTransform: "uppercase", letterSpacing: ".05em", marginTop: 4 }}>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            autoComplete="current-password"
            required
          />
        </div>
        <button className="primaryBtn" type="submit" disabled={loading} style={{ marginTop: 6, padding: "12px 14px", fontSize: 13 }}>
          {loading ? "Signing in…" : "Sign In"}
        </button>
        {error && <div className="messageBar" style={{ marginTop: 4 }}>{error}</div>}
        <p style={{ textAlign: "center", fontSize: 10, color: "var(--muted)", marginTop: 4 }}>
          E365 Event ERP · Innovate. Experience. Celebrate.
        </p>
      </form>
    </div>
  );
}

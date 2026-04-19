import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { login } from "../api";
import { setSession } from "../auth";

export default function LoginPage() {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    try {
      const data = await login(username, password);
      setSession(data);
      navigate("/");
    } catch (err) {
      setError(String(err.message || err));
    }
  }

  return (
    <div className="loginPage">
      <form className="loginCard" onSubmit={onSubmit}>
        <img src="/logo.png" alt="KPS" className="loginLogo" />
        <h1>KPS ERP Login</h1>
        <p>Use admin / admin123 or operations / ops123 or store / store123</p>
        <input value={username} onChange={(e)=>setUsername(e.target.value)} placeholder="Username" />
        <input type="password" value={password} onChange={(e)=>setPassword(e.target.value)} placeholder="Password" />
        <button className="primaryBtn" type="submit">Login</button>
        {error ? <div className="messageBar">{error}</div> : null}
      </form>
    </div>
  );
}

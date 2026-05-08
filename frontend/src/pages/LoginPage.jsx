import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { login } from "../api";
import { setSession } from "../auth";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    try {
      const data = await login(username, password);
      setSession(data);
      navigate(data.role === "super_admin" ? "/master-companies" : "/");
    } catch (err) {
      setError(String(err.message || err));
    }
  }

  return (
    <div className="loginPage">
      <form className="loginCard" onSubmit={onSubmit}>
        <img src="/eventory-logo.png?v=1" alt="Eventory ERP" className="loginLogo" />
        <h1>Eventory ERP Login</h1>
        <p>Use your master or company admin login.</p>
        <input value={username} onChange={(e)=>setUsername(e.target.value)} placeholder="Username" />
        <input type="password" value={password} onChange={(e)=>setPassword(e.target.value)} placeholder="Password" />
        <button className="primaryBtn" type="submit">Login</button>
        {error ? <div className="messageBar">{error}</div> : null}
      </form>
    </div>
  );
}

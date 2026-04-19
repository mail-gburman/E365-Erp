import React from "react";
export default function Card({ title, children, right }) {
  return (
    <section className="card">
      <div className="cardHead">
        <h2>{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

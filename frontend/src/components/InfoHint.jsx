import React from "react";

export default function InfoHint({ text }) {
  return (
    <span className="infoHint" title={text} aria-label={text}>
      i
    </span>
  );
}

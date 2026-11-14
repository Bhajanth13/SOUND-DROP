// Message formats SoundDrop can send, how each is packed into text before it
// is turned into sound, and how the receiver unpacks it again.
//
// Packed form: one letter for the type, ":" and then the fields joined by the
// ASCII unit separator (0x1F), which people cannot type by accident.
//   T:<text>
//   C:<name>␟<phone>␟<email>

import { MAX_BYTES } from "./modem.js";

export const SEP = "\u001f";

export const FORMATS = [
  { id: "text", code: "T", label: "Text", hint: "A short sentence or note" },
  { id: "contact", code: "C", label: "Contact card", hint: "Name, phone and email" }
];

export const EMPTY = {
  text: { text: "" },
  contact: { name: "", phone: "", email: "" }
};

export const byteLength = (s) => new TextEncoder().encode(s).length;

export function pack(format, v) {
  switch (format) {
    case "text": return "T:" + v.text.trim();
    case "contact": return "C:" + [v.name.trim(), v.phone.trim(), v.email.trim()].join(SEP);
    default: throw new Error("Unknown format");
  }
}

// Returns { field: "message" } for every field that is wrong; empty when valid.
export function validate(format, v) {
  const e = {};
  if (format === "text") {
    if (!v.text.trim()) e.text = "Type a message to send.";
  }
  if (format === "contact") {
    const nm = v.name.trim();
    if (nm.length < 2) e.name = "Enter at least 2 letters.";
    if (!/^\+?[0-9][0-9 ]{6,14}$/.test(v.phone.trim())) e.phone = "Enter 7 to 15 digits, e.g. +91 98450 12345.";
    if (v.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())) e.email = "Enter a valid email or leave it empty.";
  }
  if (!Object.keys(e).length) {
    const n = byteLength(pack(format, v));
    if (n > MAX_BYTES) e._size = "This message is " + n + " bytes. Shorten it to " + MAX_BYTES + " bytes or less.";
  }
  return e;
}

// Unpack a received text. Anything without a known prefix is shown as text.
export function unpack(raw) {
  const code = raw.slice(0, 2), body = raw.slice(2);
  if (code === "T:") return { format: "text", text: body };
  if (code === "C:") {
    const [name = "", phone = "", email = ""] = body.split(SEP);
    return { format: "contact", name, phone, email };
  }
  return { format: "text", text: raw };
}

// One line summary for the inbox table.
export function summary(m) {
  if (m.format === "contact") return "Contact: " + m.name;
  return m.text;
}

export const formatLabel = (id) => (FORMATS.find((f) => f.id === id) || FORMATS[0]).label;

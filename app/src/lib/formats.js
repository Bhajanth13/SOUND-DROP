// Message formats SoundDrop can send, how each is packed into text before it
// is turned into sound, and how the receiver unpacks it again.
//
// Packed form: one letter for the type, ":" and then the fields joined by the
// ASCII unit separator (0x1F), which people cannot type by accident.
//   T:<text>
//   L:<url>
//   W:<network name>␟<password>␟<security>
//   C:<name>␟<phone>␟<email>

import { MAX_BYTES } from "./modem.js";

export const SEP = "\u001f";

export const FORMATS = [
  { id: "text", code: "T", label: "Text", hint: "A short sentence or note" },
  { id: "link", code: "L", label: "Link", hint: "A web address to open" },
  { id: "wifi", code: "W", label: "Wi-Fi", hint: "Network name and password" },
  { id: "contact", code: "C", label: "Contact card", hint: "Name, phone and email" }
];

export const EMPTY = {
  text: { text: "" },
  link: { url: "" },
  wifi: { ssid: "", password: "", security: "WPA" },
  contact: { name: "", phone: "", email: "" }
};

export const byteLength = (s) => new TextEncoder().encode(s).length;

export function pack(format, v) {
  switch (format) {
    case "text": return "T:" + v.text.trim();
    case "link": return "L:" + v.url.trim();
    case "wifi": return "W:" + [v.ssid.trim(), v.security === "nopass" ? "" : v.password, v.security].join(SEP);
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
  if (format === "link") {
    const u = v.url.trim();
    if (!u) e.url = "Enter a web address.";
    else {
      try {
        const p = new URL(u);
        if (p.protocol !== "http:" && p.protocol !== "https:") e.url = "The address must start with http:// or https://.";
        else if (!p.hostname.includes(".")) e.url = "That address has no domain, for example example.com.";
      } catch (err) { e.url = "That is not a complete web address. Include https:// at the start."; }
    }
  }
  if (format === "wifi") {
    const n = v.ssid.trim().length;
    if (!n) e.ssid = "Enter the network name.";
    else if (n > 32) e.ssid = "Network names can be at most 32 characters.";
    if (v.security !== "nopass") {
      if (v.password.length < 8) e.password = "Wi-Fi passwords are at least 8 characters.";
      else if (v.password.length > 63) e.password = "Wi-Fi passwords are at most 63 characters.";
    }
  }
  if (format === "contact") {
    const nm = v.name.trim();
    if (nm.length < 2) e.name = "Enter a name of at least 2 letters.";
    if (!/^\+?[0-9][0-9 ]{6,14}$/.test(v.phone.trim())) e.phone = "Enter a phone number of 7 to 15 digits, for example +91 98450 12345.";
    if (v.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())) e.email = "Enter a valid email address or leave it empty.";
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
  if (code === "L:") return { format: "link", url: body };
  if (code === "W:") {
    const [ssid = "", password = "", security = "WPA"] = body.split(SEP);
    return { format: "wifi", ssid, password, security };
  }
  if (code === "C:") {
    const [name = "", phone = "", email = ""] = body.split(SEP);
    return { format: "contact", name, phone, email };
  }
  return { format: "text", text: raw };
}

// One line summary for the inbox table.
export function summary(m) {
  if (m.format === "link") return m.url;
  if (m.format === "wifi") return "Wi-Fi: " + m.ssid;
  if (m.format === "contact") return "Contact: " + m.name;
  return m.text;
}

export const formatLabel = (id) => (FORMATS.find((f) => f.id === id) || FORMATS[0]).label;

// A link is only opened when it is http(s); anything else is shown as text.
export const safeHref = (url) => {
  try { const p = new URL(url); return p.protocol === "http:" || p.protocol === "https:" ? p.href : null; }
  catch (e) { return null; }
};

// Labelled form input with Bootstrap validation feedback.
export default function Field({ id, label, error, hint, as = "input", children, ...props }) {
  const Tag = as;
  const cls = (as === "select" ? "form-select" : "form-control") + (error ? " is-invalid" : "");
  return (
    <div>
      <label htmlFor={id} className="form-label">{label}</label>
      {as === "select"
        ? <select id={id} className={cls} aria-describedby={id + "-fb"} {...props}>{children}</select>
        : <Tag id={id} className={cls} aria-invalid={!!error} aria-describedby={id + "-fb"} {...props} />}
      {error ? <div id={id + "-fb"} className="invalid-feedback">{error}</div> : hint ? <div id={id + "-fb"} className="form-text">{hint}</div> : null}
    </div>
  );
}

"use client";
import { useEffect, useMemo, useRef } from "react";
import { useQuill } from "react-quilljs";
import "quill/dist/quill.snow.css";

const normalizeHtml = (value) => {
  const html = String(value ?? "").trim();
  return html === "<p><br></p>" ? "" : html;
};
const normalizeText = (value) => String(value ?? "").replace(/\r\n/g, "\n");
const isHtml = (value) => /<\/?[a-z][\s\S]*>/i.test(String(value ?? ""));

/** Editor de la descripción que ve el cliente en la tienda. Mantiene sincronizado el texto del formulario. */
export default function DescriptionEditor({ value, onChange, invalid, id }) {
  const modules = useMemo(
    () => ({ toolbar: [[{ header: [2, 3, false] }], ["bold", "italic", "underline"], [{ list: "ordered" }, { list: "bullet" }], ["link"], ["clean"]] }),
    []
  );
  const { quill, quillRef } = useQuill({ theme: "snow", modules, placeholder: "Describí el producto: para qué sirve, materiales, medidas útiles…" });
  const syncing = useRef(false);

  useEffect(() => {
    if (!quill) return undefined;
    const handle = () => {
      if (syncing.current) return;
      onChange(normalizeHtml(quill.root.innerHTML));
    };
    quill.on("text-change", handle);
    return () => quill.off("text-change", handle);
  }, [quill, onChange]);

  useEffect(() => {
    if (!quill) return;
    const current = String(value ?? "");
    const formHtml = normalizeHtml(current);
    if (isHtml(current)) {
      if (normalizeHtml(quill.root.innerHTML) === formHtml) return;
    } else if (normalizeText(quill.getText().replace(/\n$/, "")) === normalizeText(current)) {
      return;
    }
    syncing.current = true;
    if (!current) quill.setText("");
    else if (isHtml(current)) quill.clipboard.dangerouslyPasteHTML(formHtml || "");
    else quill.setText(normalizeText(current));
    syncing.current = false;
  }, [quill, value]);

  return (
    <div id={id} className={`overflow-hidden rounded-lg border bg-background ${invalid ? "border-destructive" : "border-border"}`}>
      <div className="h-[320px] min-h-[240px] max-h-[640px] resize-y overflow-hidden">
        <div ref={quillRef} className="h-full [&_.ql-container]:h-[calc(100%-42px)] [&_.ql-container]:border-0 [&_.ql-editor]:overflow-y-auto [&_.ql-toolbar]:border-0 [&_.ql-toolbar]:border-b [&_.ql-toolbar]:border-border" />
      </div>
    </div>
  );
}

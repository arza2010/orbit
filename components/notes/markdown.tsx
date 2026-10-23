import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { fixEscapes } from "@/lib/notes/clean";

/** Renders model-written notes. Raw HTML is never rendered, only Markdown. */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children: c }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {c}
            </a>
          ),
        }}
      >
        {fixEscapes(children)}
      </ReactMarkdown>
    </div>
  );
}

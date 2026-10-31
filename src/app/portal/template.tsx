// Re-mounts on every navigation, giving each page a soft fade-up entrance.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 ease-out">{children}</div>;
}

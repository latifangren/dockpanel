export default function Files() {
  return (
    <div className="w-full h-full flex flex-col bg-dark-950 overflow-hidden">
      <iframe
        src="/fs/"
        title="File Manager"
        className="w-full h-full border-0 bg-dark-900"
        allow="clipboard-read; clipboard-write; fullscreen"
      />
    </div>
  );
}

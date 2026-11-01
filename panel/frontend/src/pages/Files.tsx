export default function Files() {
  return (
    <div className="w-full h-[calc(100vh-6rem)] -m-4 md:-m-6 flex flex-col bg-dark-950">
      <iframe
        src="/fs/"
        title="File Manager"
        className="w-full flex-1 border-0 bg-dark-900"
        allow="clipboard-read; clipboard-write; fullscreen"
      />
    </div>
  );
}

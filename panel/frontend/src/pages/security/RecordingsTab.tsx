import type { RecordingEntry } from "./types";

interface RecordingsTabProps {
  recordings: RecordingEntry[];
}

export default function RecordingsTab({ recordings }: RecordingsTabProps) {
  return (
    <>
      <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden">
        <div className="px-5 py-3 border-b border-dark-600">
          <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">Terminal Session Recordings</h3>
          <p className="text-xs text-dark-200 mt-0.5">Asciicast v2 recordings of all terminal sessions</p>
        </div>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-dark-600 text-left text-xs font-mono text-dark-400 uppercase">
            <th className="px-4 py-2">Filename</th><th className="px-4 py-2">Size</th><th className="px-4 py-2">Created</th>
          </tr></thead>
          <tbody>
            {recordings.map((r, i) => (
              <tr key={i} className="border-b border-dark-700 hover:bg-dark-700">
                <td className="px-4 py-2 font-mono text-dark-200">{r.filename}</td>
                <td className="px-4 py-2 text-dark-400">{(r.size_bytes / 1024).toFixed(1)} KB</td>
                <td className="px-4 py-2 text-dark-400 text-xs">{r.created || "-"}</td>
              </tr>
            ))}
            {recordings.length === 0 && <tr><td colSpan={3} className="px-4 py-8 text-center text-dark-400">No recordings yet</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

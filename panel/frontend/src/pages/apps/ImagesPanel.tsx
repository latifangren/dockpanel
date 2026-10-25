import type { Dispatch, SetStateAction } from "react";

// Moved verbatim from pages/Apps.tsx (shell identifiers passed as props,
// destructured under the same names, so the body below is unchanged).
export function ImagesPanel({
  handlePruneImages,
  handleRemoveImage,
  imagePruning,
  images,
  imagesLoading,
  loadImages,
  pruneArmed,
  setPruneArmed,
  setShowImages
}: {
  handlePruneImages: () => void;
  handleRemoveImage: (imageId: string) => void;
  imagePruning: boolean;
  images: { repository: string; tag: string; id: string; size: string; created: string }[];
  imagesLoading: boolean;
  loadImages: () => void;
  pruneArmed: boolean;
  setPruneArmed: Dispatch<SetStateAction<boolean>>;
  setShowImages: Dispatch<SetStateAction<boolean>>
}) {
  return (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 dp-modal-overlay"
          onKeyDown={(e) => { if (e.key === "Escape") setShowImages(false); }}
        >
          <div className="bg-dark-800 rounded-lg shadow-xl p-6 w-full max-w-3xl max-h-[80vh] overflow-y-auto border border-dark-500 dp-modal">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">
                Docker Images
              </h3>
              <div className="flex items-center gap-2">
                {pruneArmed ? (
                  <>
                    <button
                      onClick={() => { setPruneArmed(false); handlePruneImages(); }}
                      disabled={imagePruning}
                      className="px-3 py-1.5 text-xs font-medium bg-danger-500 text-white rounded disabled:opacity-50"
                      title="Removes dangling (untagged) images host-wide — irreversible. Rollback and snapshot images stay tagged, so they're kept."
                    >
                      {imagePruning ? "Pruning..." : "Confirm — prune dangling images"}
                    </button>
                    <button
                      onClick={() => setPruneArmed(false)}
                      disabled={imagePruning}
                      className="px-3 py-1.5 text-xs font-medium bg-dark-600 text-dark-200 rounded disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setPruneArmed(true)}
                    disabled={imagePruning}
                    className="px-3 py-1.5 text-xs font-medium bg-warn-500/10 text-warn-400 rounded hover:bg-warn-500/20 disabled:opacity-50"
                    title="Removes dangling (untagged) images host-wide — irreversible. Rollback and snapshot images stay tagged, so they're kept."
                  >
                    {imagePruning ? "Pruning..." : "Prune Unused"}
                  </button>
                )}
                <button
                  onClick={loadImages}
                  className="px-3 py-1.5 text-xs font-medium bg-dark-700 text-dark-200 rounded hover:bg-dark-600"
                >
                  Refresh
                </button>
                <button onClick={() => setShowImages(false)} className="text-dark-300 hover:text-dark-50">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
            {imagesLoading ? (
              <div className="flex items-center justify-center py-8 text-dark-300">
                <svg className="w-5 h-5 animate-spin mr-2" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                Loading images...
              </div>
            ) : images.length === 0 ? (
              <div className="text-center py-8 text-dark-300 text-sm">No Docker images found</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-dark-600">
                      <th className="text-left text-xs font-medium text-dark-300 uppercase font-mono tracking-widest pb-2">Repository</th>
                      <th className="text-left text-xs font-medium text-dark-300 uppercase font-mono tracking-widest pb-2">Tag</th>
                      <th className="text-left text-xs font-medium text-dark-300 uppercase font-mono tracking-widest pb-2">Size</th>
                      <th className="text-left text-xs font-medium text-dark-300 uppercase font-mono tracking-widest pb-2">Created</th>
                      <th className="text-right text-xs font-medium text-dark-300 uppercase font-mono tracking-widest pb-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dark-700">
                    {images.map((img, i) => (
                      <tr key={i} className="hover:bg-dark-700/30">
                        <td className="py-2 text-xs font-mono text-dark-100">{img.repository}</td>
                        <td className="py-2 text-xs font-mono text-dark-200">{img.tag}</td>
                        <td className="py-2 text-xs text-dark-200">{img.size}</td>
                        <td className="py-2 text-xs text-dark-300">{img.created}</td>
                        <td className="py-2 text-right">
                          <button
                            onClick={() => handleRemoveImage(img.id)}
                            className="text-xs text-danger-400 hover:text-danger-300"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-[10px] text-dark-300 mt-3">{images.length} image(s) total</p>
              </div>
            )}
          </div>
        </div>
  );
}

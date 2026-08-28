// 0827_MUSIC_Library_Workspace_Track_Inspector_Rearchitecture Part A §6 —
// one shared breadcrumb shell reused by Catalog/Song Library/External/
// Sounds. First segment is the library identity and opens that library's
// dashboard; the second segment is the current page (usually
// "Recordings") and is never itself a link.

interface LibraryBreadcrumbProps {
  libraryLabel: string;
  page?: string;
  onOpenDashboard?: () => void;
}

export function LibraryBreadcrumb({ libraryLabel, page, onOpenDashboard }: LibraryBreadcrumbProps) {
  return (
    <div className="lib-breadcrumb">
      {onOpenDashboard ? (
        <button type="button" className="lib-breadcrumb-root" onClick={onOpenDashboard}>
          {libraryLabel}
        </button>
      ) : (
        <span className="lib-breadcrumb-root lib-breadcrumb-root--static">{libraryLabel}</span>
      )}
      {page && (
        <>
          <span className="lib-breadcrumb-sep">/</span>
          <span className="lib-breadcrumb-page">{page}</span>
        </>
      )}
    </div>
  );
}

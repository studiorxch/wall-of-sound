type Props = {
  collectionLabel: string;
  onBackToCollection: () => void;
  createLabel?: string;
  onCreate?: () => void;
};

export function CollectionDetailBar({ collectionLabel, onBackToCollection, createLabel, onCreate }: Props) {
  return (
    <div className="ph-collection-bar">
      <div className="ph-collection-left">
        <button
          className="ph-collection-home"
          onClick={onBackToCollection}
          title={`Back to ${collectionLabel}`}
        >
          ← {collectionLabel}
        </button>
      </div>
      {createLabel && onCreate && (
        <div className="ph-collection-right">
          <button
            className="ph-collection-new"
            onClick={onCreate}
            title={createLabel}
          >
            {createLabel}
          </button>
        </div>
      )}
    </div>
  );
}

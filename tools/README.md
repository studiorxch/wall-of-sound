# WOS Tools

## syncwosspec

`syncwosspec.sh` mirrors selected WOS / PLAY / WALL files into Google Drive for ChatGPT and Claude access.

The local project is the source of truth.

The Google Drive `chatGPT-share` folder is a current-state mirror, not an archive.

## Behavior

The sync uses:

```bash
rsync -av --delete

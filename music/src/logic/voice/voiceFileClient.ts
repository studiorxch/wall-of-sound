export async function revealVoiceFileInFinder(filePath: string): Promise<{ ok: boolean; reason?: string }> {
  const response = await fetch("/voice-asset-reveal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filePath }),
  });
  return response.json();
}

export async function deleteVoiceFileOnDisk(filePath: string): Promise<{ ok: boolean; reason?: string }> {
  const response = await fetch("/voice-asset-delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filePath }),
  });
  return response.json();
}

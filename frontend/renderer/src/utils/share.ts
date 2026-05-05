export async function uploadReport(
  htmlContent: string,
  endpoint: string,
): Promise<{ url: string }> {
  try {
    const formData = new FormData();
    const blob = new Blob([htmlContent], { type: 'text/html' });
    formData.append('file', blob, `report-${Date.now()}.html`);

    const response = await fetch(endpoint, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`上传失败（status：${response.status}）`);
    }

    return await response.json();
  } catch (error) {
    throw new Error(
      `报告上传失败：${error instanceof Error ? error.message : JSON.stringify(error)}`,
    );
  }
}

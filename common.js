async function copyText(text, btn) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    flashButton(btn, '<i class="ti ti-check"></i> 已复制');
  } catch (e) {
    console.error('复制失败:', e);
  }
}

function flashButton(btn, html, duration = 1500) {
  if (!btn) return;
  const originalHtml = btn.innerHTML;
  btn.innerHTML = html;
  setTimeout(() => {
    btn.innerHTML = originalHtml;
  }, duration);
}

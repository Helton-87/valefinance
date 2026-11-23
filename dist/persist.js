/* Armazenamento local opcional. Sem envio de planilhas à rede. */
const localWorkbook = (() => {
  const dbName = 'valefinance-local-workbook';
  function open() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) return reject(Error('Armazenamento local indisponível neste navegador.'));
      const request = indexedDB.open(dbName, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('files');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || Error('Falha no armazenamento local.'));
    });
  }
  async function run(mode, action) {
    const db = await open();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction('files', mode);
        const req = action(tx.objectStore('files'));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error || Error('Falha ao acessar a planilha salva.'));
        tx.onerror = () => reject(tx.error || Error('Falha na operação local.'));
      });
    } finally { db.close(); }
  }
  return {
    read: () => run('readonly', store => store.get('current')),
    save: file => run('readwrite', store => store.put({file, savedAt:Date.now()}, 'current')),
    clear: () => run('readwrite', store => store.delete('current'))
  };
})();

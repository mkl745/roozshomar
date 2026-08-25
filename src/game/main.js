(function () {
  function start() {
    if (!document.getElementById('gl').getContext) {
      document.getElementById('nogl').style.display = 'flex';
      return;
    }
    let gl2 = null;
    try { gl2 = document.getElementById('gl').getContext('webgl2'); } catch (e) { }
    if (!gl2) {
      document.getElementById('nogl').style.display = 'flex';
      return;
    }

    UI.init(Engine);

    setTimeout(() => {
      try {
        Engine.boot(document.getElementById('gl'));
        UI.titleButtons(Engine.hasSave());
      } catch (err) {
        console.error(err);
        const note = document.getElementById('load-note');
        if (note) {
          note.textContent = 'could not start — ' + err.message;
          note.style.animation = 'none';
        }
      }
    }, 60);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();

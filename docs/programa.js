// Tabs: cambia la sección visible y el estado seleccionado
(function () {
  const buttons = document.querySelectorAll('.tab-btn');
  const sections = document.querySelectorAll('.section');

  function activate(targetId) {
    // aria-selected en botones
    buttons.forEach(btn => {
      const isActive = btn.dataset.target === targetId;
      btn.setAttribute('aria-selected', String(isActive));
    });
    // mostrar/ocultar secciones
    sections.forEach(sec => {
      sec.dataset.active = String(sec.id === targetId);
    });
    // mover el foco al título de la sección activa (accesibilidad)
    const activeSection = document.getElementById(targetId);
    const h2 = activeSection.querySelector('h2');
    if (h2) h2.setAttribute('tabindex', '-1'), h2.focus();
  }

  buttons.forEach(btn => {
    btn.addEventListener('click', () => activate(btn.dataset.target));
    // soporte de teclado con flechas
    btn.addEventListener('keydown', (e) => {
      const idx = Array.from(buttons).indexOf(btn);
      if (e.key === 'ArrowRight') buttons[(idx + 1) % buttons.length].focus();
      if (e.key === 'ArrowLeft') buttons[(idx - 1 + buttons.length) % buttons.length].focus();
      if (e.key === 'Enter' || e.key === ' ') activate(btn.dataset.target);
    });
  });

  // Acciones demo en "Problemáticas"
  document.querySelectorAll('[data-action="reportar"]').forEach(el => {
    el.addEventListener('click', () => alert('Abrir modal de reporte (demo)'));
  });
  document.querySelectorAll('[data-action="filtrar"]').forEach(el => {
    el.addEventListener('click', () => alert('Abrir filtros (demo)'));
  });
})();

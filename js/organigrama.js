/**
 * Organigrama interactivo - Benny's Original Motor Works
 * Trabajadores: vista estática (como imagen)
 * Administrador: edición completa
 */

function buildOrganigramaTree(nodes) {
  const byParent = {};
  nodes.forEach(n => {
    const pid = n.parentId || '__root';
    if (!byParent[pid]) byParent[pid] = [];
    byParent[pid].push(n);
  });
  Object.keys(byParent).forEach(pid => {
    byParent[pid].sort((a, b) => (a.orden || 0) - (b.orden || 0));
  });
  const byId = {};
  nodes.forEach(n => { byId[n.id] = n; });
  return { byParent, byId };
}

function renderOrganigrama(containerId, isEditMode) {
  const container = document.getElementById(containerId);
  if (!container) return;
  // Siempre datos frescos desde usuarios/localStorage
  const data = getOrganigrama();
  const { byParent, byId } = buildOrganigramaTree(data.nodes);

  const rootNodes = byParent['__root'] || data.nodes.filter(n => !n.parentId);
  if (rootNodes.length === 0) {
    rootNodes.push(...data.nodes.filter(n => n.nivel === 0));
  }
  rootNodes.sort((a, b) => (a.orden || 0) - (b.orden || 0));

  function renderLevel(nodes, level = 0) {
    if (!nodes || nodes.length === 0) return '';
    const levelClass = 'org-level-' + level;
    const hasConnectorDrop = level > 0;
    let html = `<div class="org-level ${levelClass}">`;
    nodes.forEach(node => {
      const children = byParent[node.id] || [];
      const tipoClass = (node.rol || '').toLowerCase().includes('dueño') ? 'org-dueno' :
        (node.rol || '').toLowerCase().includes('socio') ? 'org-socio' :
        (node.rol || '').toLowerCase().includes('admin') ? 'org-dueno' :
        (node.rol || '').toLowerCase().includes('responsable') ? 'org-responsable' : 'org-mecanico';
      const fotoUrl = (node.foto || '').trim();
      const fotoHtml = fotoUrl && fotoUrl.startsWith('http') ? '<div class="org-node-foto"><img src="' + escapeHtml(fotoUrl) + '" alt="" onerror="this.parentElement.classList.add(\'org-foto-error\')"></div>' : '<div class="org-node-foto org-node-foto-placeholder"><span class="org-iniciales">' + escapeHtml(node.nombre ? node.nombre.substring(0, 2).toUpperCase() : '?') + '</span></div>';
      html += `
        <div class="org-node-wrap" data-id="${node.id}" ${isEditMode ? 'draggable="true"' : ''}>
          ${hasConnectorDrop ? '<div class="org-connector-drop"></div>' : ''}
          <div class="org-node ${tipoClass}" ${isEditMode ? `data-edit="${node.id}"` : ''}>
            ${fotoHtml}
            <div class="org-node-content">
              <span class="org-nombre">${escapeHtml(node.nombre || 'Sin nombre')}</span>
              <span class="org-rol">${escapeHtml(node.rol || '')}</span>
            </div>
          </div>
          ${children.length > 0 ? `
            <div class="org-children">
              <div class="org-connector org-connector-vertical"></div>
              <div class="org-connector-h"></div>
              ${renderLevel(children, level + 1)}
            </div>
          ` : ''}
        </div>
      `;
    });
    html += '</div>';
    return html;
  }

  container.innerHTML = `
    <div class="org-chart">
      ${renderLevel(rootNodes)}
    </div>
  `;

  container.classList.toggle('org-view-only', !isEditMode);
  if (isEditMode) {
    bindOrganigramaSelect(container, data);
    bindOrganigramaDragDrop(container, containerId, data);
  }
  hideOrganigramaToolbar();
}

function showOrganigramaToolbar(nodeId, nodeNombre, nodeUsername) {
  const bar = document.getElementById('orgToolbarSeleccion');
  const label = document.getElementById('orgToolbarNombre');
  if (bar && label) {
    bar.style.display = 'flex';
    bar.dataset.selectedId = nodeId || '';
    bar.dataset.selectedUsername = nodeUsername || '';
    label.textContent = nodeNombre || '—';
  }
}

function hideOrganigramaToolbar() {
  const bar = document.getElementById('orgToolbarSeleccion');
  if (bar) {
    bar.style.display = 'none';
    bar.dataset.selectedId = '';
    bar.dataset.selectedUsername = '';
  }
}

function bindOrganigramaSelect(container, data) {
  container.querySelectorAll('.org-node-wrap').forEach(wrap => {
    wrap.addEventListener('click', function (e) {
      if (e.target.closest('.org-connector-drop')) return;
      e.stopPropagation(); // Evitar que el clic en un hijo seleccione el nodo padre (solo la posición individual)
      const id = this.dataset.id;
      if (!id) return;
      const node = data.nodes.find(n => n.id === id);
      if (!node) return;
      container.querySelectorAll('.org-node-wrap').forEach(w => w.classList.remove('org-node-selected'));
      this.classList.add('org-node-selected');
      showOrganigramaToolbar(id, node.nombre, node.username || '');
    });
  });
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function bindOrganigramaDragDrop(container, containerId, data) {
  const users = typeof getUsers === 'function' ? getUsers() : [];
  const userIds = new Set(users.map(u => u.id));
  let draggedNodeId = null;

  container.querySelectorAll('.org-node-wrap[draggable="true"]').forEach(wrap => {
    wrap.addEventListener('dragstart', function (e) {
      if (e.target.closest('.org-node-actions')) return;
      const id = this.dataset.id;
      if (!id) return;
      draggedNodeId = id;
      e.dataTransfer.setData('text/plain', id);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.dropEffect = 'move';
      try { e.dataTransfer.setData('application/json', JSON.stringify({ id: id })); } catch (err) {}
      this.classList.add('org-dragging');
    });
    wrap.addEventListener('dragend', function () {
      this.classList.remove('org-dragging');
      draggedNodeId = null;
      container.querySelectorAll('.org-node-wrap').forEach(w => w.classList.remove('org-drop-target'));
    });
  });

  function clearDropTargets() {
    container.querySelectorAll('.org-node-wrap').forEach(w => w.classList.remove('org-drop-target'));
  }

  container.addEventListener('dragover', function (e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const wrap = e.target.closest('.org-node-wrap');
    if (!wrap || !wrap.dataset || !wrap.dataset.id) { clearDropTargets(); return; }
    const id = draggedNodeId || e.dataTransfer.getData('text/plain');
    if (id && id !== wrap.dataset.id) {
      clearDropTargets();
      wrap.classList.add('org-drop-target');
    } else clearDropTargets();
  }, false);

  container.addEventListener('dragleave', function (e) {
    if (!container.contains(e.relatedTarget)) clearDropTargets();
  }, false);

  container.addEventListener('drop', function (e) {
    e.preventDefault();
    e.stopPropagation();
    clearDropTargets();
    const targetWrap = e.target.closest('.org-node-wrap');
    const targetId = targetWrap && targetWrap.dataset ? targetWrap.dataset.id : null;
    const draggedId = draggedNodeId || e.dataTransfer.getData('text/plain');
    if (!draggedId || !targetId || draggedId === targetId) return;

    var currentUsers = typeof getUsers === 'function' ? getUsers() : [];
    var currentUserIds = new Set(currentUsers.map(function (u) { return u.id; }));

    function isDescendant(nodeId, ancestorId, nodes) {
      var node = nodes.find(function (n) { return n.id === nodeId; });
      if (!node || !node.parentId) return false;
      if (node.parentId === ancestorId) return true;
      return isDescendant(node.parentId, ancestorId, nodes);
    }
    var currentData = getOrganigrama();
    var nodes = (currentData && currentData.nodes) ? currentData.nodes : [];
    if (isDescendant(targetId, draggedId, nodes)) return;

    if (currentUserIds.has(draggedId)) {
      var targetUser = currentUsers.find(function (u) { return u.id === targetId; });
      if (!targetUser || targetUser.id === draggedId) return;
      var targetUsername = targetUser.username || '';
      var draggedUser = currentUsers.find(function (u) { return u.id === draggedId; });
      var draggedNombre = (draggedUser && (draggedUser.nombre || draggedUser.username)) || 'Usuario';
      var targetNombre = (targetUser.nombre || targetUser.username) || 'Responsable';
      try {
        var sessionStr = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('benny_session') : null;
        var session = sessionStr ? JSON.parse(sessionStr) : null;
        if (typeof updateUser === 'function' && session) {
          updateUser(draggedId, { responsable: targetUsername }, session.username).then(function (res) {
            if (res && res.error) {
              alert(res.error);
            } else {
              if (typeof renderOrganigrama === 'function') {
                renderOrganigrama(containerId, true);
              }
              alert('Responsable actualizado: ' + draggedNombre + ' depende ahora de ' + targetNombre + '.');
            }
          }).catch(function (err) {
            alert('No se pudo actualizar: ' + (err && err.message ? err.message : 'Error desconocido'));
            if (typeof renderOrganigrama === 'function') renderOrganigrama(containerId, true);
          });
        } else {
          if (typeof renderOrganigrama === 'function') renderOrganigrama(containerId, true);
        }
      } catch (err) {
        alert('Error: ' + (err && err.message ? err.message : String(err)));
        if (typeof renderOrganigrama === 'function') renderOrganigrama(containerId, true);
      }
    } else {
      var org = getOrganigrama();
      var node = org.nodes.find(function (n) { return n.id === draggedId; });
      if (node) {
        node.parentId = targetId;
        saveOrganigrama(org);
        if (typeof renderOrganigrama === 'function') renderOrganigrama(containerId, true);
      }
    }
  }, false);
}

// Acciones de la barra de herramientas (editar / subordinado / eliminar) se enlazan en app.js

function editarNodoOrganigrama(id) {
  const data = getOrganigrama();
  const node = data.nodes.find(n => n.id === id);
  if (!node) return;
  const nombre = prompt('Nombre:', node.nombre || '');
  if (nombre === null) return;
  const rol = prompt('Rol / Cargo:', node.rol || '');
  if (rol === null) return;
  const foto = prompt('URL de la foto (opcional):', node.foto || '');
  node.nombre = nombre.trim() || node.nombre;
  node.rol = rol.trim() || node.rol;
  if (foto !== null) node.foto = (foto || '').trim();
  saveOrganigrama(data);
  renderOrganigrama('organigramaContainer', true);
}

function añadirNodoOrganigrama(parentId, nivel, ordenAlFinal = null) {
  const data = getOrganigrama();
  const hermanos = data.nodes.filter(n => n.parentId === parentId);
  const orden = ordenAlFinal !== null ? ordenAlFinal : (Math.max(-1, ...hermanos.map(h => h.orden ?? 0)) + 1);
  const newNode = {
    id: generateNodeId(),
    nombre: 'Nuevo',
    rol: nivel === 0 ? 'Socio' : nivel === 1 ? 'Responsable de mecánicos' : 'Mecánico',
    nivel,
    parentId: parentId || null,
    orden,
    foto: '',
  };
  data.nodes.push(newNode);
  saveOrganigrama(data);
  renderOrganigrama('organigramaContainer', true);
  editarNodoOrganigrama(newNode.id);
}

function eliminarNodoOrganigrama(id) {
  const data = getOrganigrama();
  const children = data.nodes.filter(n => n.parentId === id);
  if (children.length > 0 && !confirm('Este nodo tiene subordinados. ¿Eliminar todos?')) return;
  data.nodes = data.nodes.filter(n => n.id !== id);
  data.nodes.forEach(n => { if (n.parentId === id) n.parentId = null; });
  saveOrganigrama(data);
  renderOrganigrama('organigramaContainer', true);
}

function añadirNivelRaiz() {
  const users = typeof getUsers === 'function' ? getUsers() : [];
  if (users.length > 0 && typeof abrirFormUsuarioNuevoConResponsable === 'function') {
    abrirFormUsuarioNuevoConResponsable(null);
    return;
  }
  const data = getOrganigrama();
  const raices = data.nodes.filter(n => !n.parentId);
  const maxOrden = Math.max(-1, ...raices.map(n => n.orden ?? 0));
  añadirNodoOrganigrama(null, 0, maxOrden + 1);
}

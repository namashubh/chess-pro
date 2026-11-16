import * as THREE from 'three';

const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const cellSize = 1;

function makeWoodTexture(base, grain, seed) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  context.fillStyle = base;
  context.fillRect(0, 0, canvas.width, canvas.height);
  const wash = context.createLinearGradient(0, 0, 512, 512);
  wash.addColorStop(0, 'rgba(255,255,255,.13)');
  wash.addColorStop(.48, 'rgba(255,255,255,0)');
  wash.addColorStop(1, 'rgba(28,16,8,.13)');
  context.fillStyle = wash;
  context.fillRect(0, 0, 512, 512);
  for (let index = 0; index < 94; index += 1) {
    const y = index * 5.5;
    const offset = Math.sin(index * 2.17 + seed) * 12;
    context.beginPath();
    context.moveTo(0, y + offset);
    context.bezierCurveTo(150, y - 10 + offset, 340, y + 13 - offset, 512, y + offset * .4);
    context.strokeStyle = `rgba(${grain},${index % 7 === 0 ? '.19' : '.075'})`;
    context.lineWidth = index % 9 === 0 ? 2 : 1;
    context.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function makeMetal(color, roughness = .25, metalness = .72) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function lathe(group, profile, material, y = 0) {
  const geometry = new THREE.LatheGeometry(profile.map(([radius, height]) => new THREE.Vector2(radius, height)), 40);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = y;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function addBox(group, dimensions, position, material, rotation = [0, 0, 0]) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...dimensions), material);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function createPiece(type, color, materials) {
  const group = new THREE.Group();
  const body = color === 'w' ? materials.ivory : materials.ebony;
  const trim = color === 'w' ? materials.gold : materials.darkGold;
  const baseProfile = [
    [0, 0], [.28, 0], [.32, .035], [.32, .085], [.27, .12], [.23, .16],
    [.20, .20], [.15, .24], [.13, .30], [.18, .34], [.20, .38], [.18, .42], [.12, .45], [0, .45],
  ];
  lathe(group, baseProfile, body);
  lathe(group, [[.24, .085], [.275, .085], [.28, .105], [.25, .12], [.22, .12]], trim, .01);
  const ball = (radius, position, material = body, segments = 20) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, segments, 16), material);
    mesh.position.set(...position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };

  if (type === 'p') {
    lathe(group, [[0, .38], [.12, .38], [.13, .46], [.105, .50], [.09, .66], [.13, .70], [.15, .74], [.11, .77], [0, .77]], body);
    ball(.16, [0, .91, 0], color === 'w' ? materials.cream : materials.ebony);
  } else if (type === 'r') {
    lathe(group, [[0, .38], [.16, .38], [.18, .45], [.15, .52], [.15, .84], [.22, .84], [.23, .90], [.19, .94], [0, .94]], body);
    lathe(group, [[.18, .81], [.225, .81], [.23, .86], [.18, .88]], trim);
    for (let segment = 0; segment < 8; segment += 1) {
      const angle = (segment / 8) * Math.PI * 2;
      addBox(group, [.105, .15, .10], [Math.cos(angle) * .17, .99, Math.sin(angle) * .17], body, [0, -angle, 0]);
    }
  } else if (type === 'n') {
    lathe(group, [[0, .38], [.17, .38], [.19, .46], [.14, .51], [.13, .63], [.18, .68], [0, .68]], body);
    const shape = new THREE.Shape();
    shape.moveTo(-.16, 0);
    shape.quadraticCurveTo(-.28, .18, -.19, .37);
    shape.lineTo(-.08, .58);
    shape.quadraticCurveTo(-.02, .72, .10, .69);
    shape.lineTo(.18, .56);
    shape.lineTo(.13, .43);
    shape.quadraticCurveTo(.36, .44, .29, .29);
    shape.lineTo(.10, .22);
    shape.quadraticCurveTo(.15, .07, .06, 0);
    shape.closePath();
    const head = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: .16, bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize: .035, bevelThickness: .035 }), body);
    head.position.set(0, .55, -.08);
    head.castShadow = true;
    head.receiveShadow = true;
    group.add(head);
    ball(.035, [.12, 1.08, .01], trim, 12);
    addBox(group, [.25, .035, .025], [.12, .86, .095], trim);
  } else if (type === 'b') {
    lathe(group, [[0, .38], [.17, .38], [.19, .45], [.14, .52], [.10, .67], [.16, .76], [.17, .81], [.10, .85], [0, .85]], body);
    ball(.13, [0, .98, 0], body);
    const seam = new THREE.Mesh(new THREE.TorusGeometry(.12, .018, 8, 28), trim);
    seam.position.set(0, .99, 0);
    seam.rotation.x = Math.PI / 2.8;
    seam.castShadow = true;
    group.add(seam);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(.07, .17, 16), trim);
    tip.position.y = 1.16;
    tip.castShadow = true;
    group.add(tip);
  } else if (type === 'q' || type === 'k') {
    lathe(group, [[0, .38], [.19, .38], [.21, .46], [.16, .53], [.11, .70], [.17, .76], [.20, .82], [.15, .88], [.09, .94], [0, .94]], body);
    lathe(group, [[.14, .82], [.19, .82], [.20, .86], [.16, .89], [.12, .89]], trim);
    if (type === 'q') {
      const crown = new THREE.Mesh(new THREE.TorusGeometry(.14, .028, 8, 32), trim);
      crown.position.y = .99;
      crown.castShadow = true;
      group.add(crown);
      for (let point = 0; point < 5; point += 1) {
        const angle = (point / 5) * Math.PI * 2;
        ball(.055, [Math.cos(angle) * .14, 1.08, Math.sin(angle) * .14], trim, 14);
      }
      ball(.065, [0, 1.10, 0], trim, 14);
    } else {
      addBox(group, [.085, .30, .085], [0, 1.08, 0], trim);
      addBox(group, [.28, .075, .085], [0, 1.12, 0], trim);
      ball(.07, [0, 1.26, 0], body, 16);
    }
  }
  return group;
}

function makeCoordinateLabel(text, materialColor) {
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 96;
  const context = canvas.getContext('2d');
  context.fillStyle = materialColor;
  context.font = '600 58px Georgia';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, 48, 50);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(.20, .20, 1);
  return sprite;
}

export function createChessboard(mount, onSquareClick) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#342f2a');
  const camera = new THREE.PerspectiveCamera(38, 1, .1, 100);
  camera.position.set(0, 13, 11);
  camera.lookAt(0, .2, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
  renderer.domElement.className = 'chessboard-canvas';
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute('role', 'grid');
  renderer.domElement.setAttribute('aria-label', '3D chessboard. Use arrow keys to select a square and Enter to move.');
  renderer.domElement.style.touchAction = 'none';

  scene.add(new THREE.HemisphereLight('#fff8e6', '#514338', 2.05));
  const keyLight = new THREE.DirectionalLight('#fff0d4', 4.2);
  keyLight.position.set(-5, 12, 8);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.camera.left = -9;
  keyLight.shadow.camera.right = 9;
  keyLight.shadow.camera.top = 9;
  keyLight.shadow.camera.bottom = -9;
  keyLight.shadow.bias = -.00025;
  keyLight.shadow.normalBias = .025;
  scene.add(keyLight);
  const fillLight = new THREE.DirectionalLight('#c2d7ff', 1.05);
  fillLight.position.set(6, 6, -6);
  scene.add(fillLight);

  const tableTexture = makeWoodTexture('#403329', '20,14,9', 7.3);
  tableTexture.wrapS = THREE.RepeatWrapping;
  tableTexture.wrapT = THREE.RepeatWrapping;
  tableTexture.repeat.set(26, 26);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ map: tableTexture, roughness: .78 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -.25;
  floor.receiveShadow = true;
  scene.add(floor);

  const woodTexture = makeWoodTexture('#65472d', '48,29,14', 1.4);
  const darkSquareTexture = makeWoodTexture('#547447', '23,39,14', 2.2);
  const lightSquareTexture = makeWoodTexture('#d8d4b8', '78,65,41', 4.1);
  const materials = {
    board: new THREE.MeshStandardMaterial({ map: woodTexture, roughness: .34, metalness: .12 }),
    lightSquare: new THREE.MeshStandardMaterial({ map: lightSquareTexture, roughness: .48, metalness: .02 }),
    darkSquare: new THREE.MeshStandardMaterial({ map: darkSquareTexture, roughness: .44, metalness: .02 }),
    ivory: makeMetal('#f1e0b7', .24, .48),
    cream: makeMetal('#fff0cf', .19, .38),
    ebony: makeMetal('#302321', .20, .62),
    gold: makeMetal('#c39752', .23, .72),
    darkGold: makeMetal('#786044', .26, .67),
    boardInlay: makeMetal('#a17e4b', .28, .58),
  };

  const boardBase = new THREE.Mesh(new THREE.BoxGeometry(8.75, .40, 8.75), materials.board);
  boardBase.position.y = -.03;
  boardBase.castShadow = true;
  boardBase.receiveShadow = true;
  scene.add(boardBase);
  const inlay = new THREE.Group();
  addBox(inlay, [8.38, .022, .026], [0, .178, -4.13], materials.boardInlay);
  addBox(inlay, [8.38, .022, .026], [0, .178, 4.13], materials.boardInlay);
  addBox(inlay, [.026, .022, 8.38], [-4.13, .178, 0], materials.boardInlay);
  addBox(inlay, [.026, .022, 8.38], [4.13, .178, 0], materials.boardInlay);
  scene.add(inlay);

  const squares = new Map();
  const squaresByMesh = new Map();
  const highlights = new Map();
  const markers = new THREE.Group();
  scene.add(markers);
  for (let rank = 1; rank <= 8; rank += 1) {
    for (let fileIndex = 0; fileIndex < 8; fileIndex += 1) {
      const square = `${files[fileIndex]}${rank}`;
      const x = fileIndex - 3.5;
      const z = 4.5 - rank;
      const isLight = (fileIndex + rank) % 2 === 1;
      const squareMesh = new THREE.Mesh(new THREE.PlaneGeometry(cellSize, cellSize), isLight ? materials.lightSquare : materials.darkSquare);
      squareMesh.rotation.x = -Math.PI / 2;
      squareMesh.position.set(x, .178, z);
      squareMesh.receiveShadow = true;
      squareMesh.userData.square = square;
      scene.add(squareMesh);
      squares.set(square, { mesh: squareMesh, x, z });
      squaresByMesh.set(squareMesh, square);

      const highlight = new THREE.Mesh(
        new THREE.PlaneGeometry(.96, .96),
        new THREE.MeshBasicMaterial({ color: '#d8d344', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
      );
      highlight.rotation.x = -Math.PI / 2;
      highlight.position.set(x, .186, z);
      highlight.visible = false;
      scene.add(highlight);
      highlights.set(square, highlight);
    }
  }

  for (let fileIndex = 0; fileIndex < 8; fileIndex += 1) {
    const fileLabel = makeCoordinateLabel(files[fileIndex], '#f0dfb8');
    fileLabel.position.set(fileIndex - 3.5, .18, 4.18);
    scene.add(fileLabel);
    const farFileLabel = makeCoordinateLabel(files[7 - fileIndex], '#f0dfb8');
    farFileLabel.position.set(fileIndex - 3.5, .18, -4.18);
    scene.add(farFileLabel);
    const rankLabel = makeCoordinateLabel(String(fileIndex + 1), '#f0dfb8');
    rankLabel.position.set(-4.18, .18, 3.5 - fileIndex);
    scene.add(rankLabel);
    const farRankLabel = makeCoordinateLabel(String(8 - fileIndex), '#f0dfb8');
    farRankLabel.position.set(4.18, .18, 3.5 - fileIndex);
    scene.add(farRankLabel);
  }

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const pieces = new Map();
  let currentMount = mount;
  let currentFen = '';
  let currentVisualSignature = '';
  let currentView = null;
  let flipped = false;
  let cursorFile = 4;
  let cursorRank = 2;
  let pointerStart = null;

  function resize() {
    if (!currentMount) return;
    const width = currentMount.clientWidth;
    const height = currentMount.clientHeight;
    if (!width || !height) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    const pixelRatio = renderer.getPixelRatio();
    if (renderer.domElement.width !== Math.floor(width * pixelRatio) || renderer.domElement.height !== Math.floor(height * pixelRatio)) {
      renderer.setSize(width, height, false);
    }
    renderer.render(scene, camera);
  }

  function mountBoard(element) {
    currentMount = element;
    if (renderer.domElement.parentElement !== element) element.replaceChildren(renderer.domElement);
    resize();
  }

  function renderScene() {
    if (!currentMount || !currentView || !currentMount.clientWidth) return;
    renderer.render(scene, camera);
  }

  function update(view) {
    currentView = view;
    const visualSignature = JSON.stringify([view.fen, view.selected, view.legalMoves, view.lastMove, view.checkedKing, view.flipped]);
    if (visualSignature === currentVisualSignature) return;
    currentVisualSignature = visualSignature;
    if (view.fen !== currentFen) {
      for (const pieceGroup of pieces.values()) {
        scene.remove(pieceGroup);
        pieceGroup.traverse((child) => {
          child.geometry?.dispose();
        });
      }
      pieces.clear();
      view.board.forEach((row, rowIndex) => row.forEach((piece, fileIndex) => {
        if (!piece) return;
        const square = `${files[fileIndex]}${8 - rowIndex}`;
        const cell = squares.get(square);
        const group = createPiece(piece.type, piece.color, materials);
        group.position.set(cell.x, .19, cell.z);
        group.scale.setScalar(.91);
        group.userData.square = square;
        scene.add(group);
        pieces.set(square, group);
      }));
      currentFen = view.fen;
    }

    while (markers.children.length) {
      const marker = markers.children[0];
      markers.remove(marker);
      marker.geometry.dispose();
      marker.material.dispose();
    }
    for (const [square, highlight] of highlights) {
      const selected = view.selected === square;
      const lastMove = view.lastMove?.from === square || view.lastMove?.to === square;
      const inCheck = view.checkedKing === square;
      highlight.visible = selected || lastMove || inCheck;
      highlight.material.color.set(inCheck ? '#d9513e' : selected ? '#e2c946' : '#c9d35b');
      highlight.material.opacity = selected ? .48 : inCheck ? .46 : .34;
    }
    for (const square of view.legalMoves) {
      const cell = squares.get(square);
      const fileIndex = files.indexOf(square[0]);
      const rankIndex = 8 - Number(square[1]);
      const capture = Boolean(view.board[rankIndex][fileIndex]);
      const marker = new THREE.Mesh(
        capture ? new THREE.RingGeometry(.34, .44, 40) : new THREE.CircleGeometry(.115, 32),
        new THREE.MeshBasicMaterial({ color: '#26392b', transparent: true, opacity: capture ? .68 : .55, side: THREE.DoubleSide, depthWrite: false }),
      );
      marker.rotation.x = -Math.PI / 2;
      marker.position.set(cell.x, .199, cell.z);
      markers.add(marker);
    }
    if (view.flipped !== flipped) {
      flipped = view.flipped;
      camera.position.set(0, 13, flipped ? -11 : 11);
      camera.lookAt(0, .2, 0);
      camera.updateProjectionMatrix();
    }
    renderScene();
  }

  function squareFromEvent(event) {
    const bounds = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
    pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects([...squaresByMesh.keys()], false)[0];
    return hit ? squaresByMesh.get(hit.object) : null;
  }

  renderer.domElement.addEventListener('pointerdown', (event) => {
    pointerStart = { x: event.clientX, y: event.clientY };
    renderer.domElement.focus({ preventScroll: true });
  });
  renderer.domElement.addEventListener('pointerup', (event) => {
    if (!pointerStart || Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 9) return;
    const square = squareFromEvent(event);
    if (!square) return;
    cursorFile = files.indexOf(square[0]);
    cursorRank = Number(square[1]);
    renderer.domElement.setAttribute('aria-label', `Chessboard. Selected cursor ${square}. Use arrow keys and Enter to play.`);
    onSquareClick(square);
    renderer.domElement.focus({ preventScroll: true });
  });
  renderer.domElement.addEventListener('keydown', (event) => {
    const fileDelta = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
    const rankDelta = event.key === 'ArrowDown' ? -1 : event.key === 'ArrowUp' ? 1 : 0;
    if (fileDelta || rankDelta) {
      event.preventDefault();
      cursorFile = Math.max(0, Math.min(7, cursorFile + fileDelta));
      cursorRank = Math.max(1, Math.min(8, cursorRank + rankDelta));
      const square = `${files[cursorFile]}${cursorRank}`;
      renderer.domElement.setAttribute('aria-label', `Chessboard. Cursor on ${square}. Use Enter to select.`);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSquareClick(`${files[cursorFile]}${cursorRank}`);
      renderer.domElement.focus({ preventScroll: true });
    }
  });
  window.addEventListener('resize', resize);
  mountBoard(mount);

  return { mount: mountBoard, update, render: renderScene };
}

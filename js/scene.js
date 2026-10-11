/* =========================================================
   Three.js scenes: starry background with floating hearts,
   and an interactive 3D birthday cake with real candles.
   ========================================================= */
(function () {
  'use strict';

  const isMobile = window.matchMedia('(max-width: 760px)').matches;

  // Colours and counts come from config.js (CONFIG.theme / CONFIG.settings)
  const TH = window.CONFIG.theme;
  const CK = TH.cake;
  const color3 = c => new THREE.Color(c);
  // A dim version of a colour, used as a soft glow so hearts never look flat
  const glowOf = c => color3(c).multiplyScalar(0.18);

  function glowTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.25, 'rgba(255,255,255,0.75)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }

  function heartShape() {
    const s = new THREE.Shape();
    s.moveTo(5, 5);
    s.bezierCurveTo(5, 5, 4, 0, 0, 0);
    s.bezierCurveTo(-6, 0, -6, 7, -6, 7);
    s.bezierCurveTo(-6, 11, -3, 15.4, 5, 19);
    s.bezierCurveTo(12, 15.4, 16, 11, 16, 7);
    s.bezierCurveTo(16, 7, 16, 0, 10, 0);
    s.bezierCurveTo(7, 0, 5, 5, 5, 5);
    return s;
  }

  function heartGeometry(scale) {
    const geo = new THREE.ExtrudeGeometry(heartShape(), {
      depth: 4, bevelEnabled: true, bevelSegments: 4, steps: 1, bevelSize: 1.6, bevelThickness: 1.6, curveSegments: 24
    });
    geo.center();
    geo.rotateZ(Math.PI);
    geo.scale(scale, scale, scale);
    return geo;
  }

  /* ---------------- Background ---------------- */
  function initBackground(canvas) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobile, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.setSize(window.innerWidth, window.innerHeight);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(color3(TH.bg), 0.03);
    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200);
    camera.position.z = 20;

    // Stars
    const N = isMobile ? 1400 : 2800;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    const palette = TH.stars.map(color3);
    for (let i = 0; i < N; i++) {
      const r = 20 + Math.random() * 70;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th);
      pos[i * 3 + 2] = r * Math.cos(ph) - 20;
      const c = palette[(Math.random() * palette.length) | 0];
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
      size: 0.55, map: glowTexture(), vertexColors: true, transparent: true,
      depthWrite: false, blending: THREE.AdditiveBlending, fog: false
    }));
    scene.add(stars);

    // Floating hearts
    const geo = heartGeometry(0.05);
    const mats = TH.floatingHearts.map(c =>
      new THREE.MeshStandardMaterial({ color: color3(c), roughness: 0.3, metalness: 0.3, emissive: glowOf(c) }));
    const hearts = [];
    const count = isMobile ? 18 : 32;
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(geo, mats[i % mats.length]);
      m.position.set((Math.random() - 0.5) * 44, (Math.random() - 0.5) * 34, -Math.random() * 28 + 4);
      const s = 0.5 + Math.random() * 0.9;
      m.scale.setScalar(s);
      m.rotation.set(Math.random() * 6, Math.random() * 6, 0);
      m.userData = { vy: 0.008 + Math.random() * 0.02, rs: 0.004 + Math.random() * 0.012, sway: Math.random() * 6, amp: 0.004 + Math.random() * 0.01 };
      scene.add(m);
      hearts.push(m);
    }

    scene.add(new THREE.AmbientLight(0xffffff, 0.45));
    const l1 = new THREE.PointLight(color3(TH.primary), 2, 80); l1.position.set(12, 10, 12); scene.add(l1);
    const l2 = new THREE.PointLight(color3(TH.secondary), 2, 80); l2.position.set(-14, -6, 8); scene.add(l2);
    const l3 = new THREE.DirectionalLight(0xffffff, 0.6); l3.position.set(0, 5, 10); scene.add(l3);

    let mx = 0, my = 0;
    window.addEventListener('pointermove', e => {
      mx = e.clientX / window.innerWidth - 0.5;
      my = e.clientY / window.innerHeight - 0.5;
    }, { passive: true });

    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    const clock = new THREE.Clock();
    (function loop() {
      requestAnimationFrame(loop);
      const t = clock.getElapsedTime();
      const sy = window.scrollY || 0;
      stars.rotation.y = t * 0.012 + sy * 0.00015;
      stars.rotation.x = sy * 0.0001;
      hearts.forEach(h => {
        const d = h.userData;
        h.position.y += d.vy;
        h.position.x += Math.sin(t + d.sway) * d.amp;
        h.rotation.y += d.rs;
        h.rotation.x += d.rs * 0.4;
        if (h.position.y > 18) { h.position.y = -18; h.position.x = (Math.random() - 0.5) * 44; }
      });
      camera.position.x += (mx * 4 - camera.position.x) * 0.03;
      camera.position.y += (-my * 3 - camera.position.y) * 0.03;
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
    })();
  }

  /* ---------------- Cake ---------------- */
  function stripeTexture(c1, c2) {
    const cv = document.createElement('canvas');
    cv.width = 64; cv.height = 128;
    const g = cv.getContext('2d');
    g.fillStyle = c1; g.fillRect(0, 0, 64, 128);
    g.strokeStyle = c2; g.lineWidth = 10;
    for (let y = -64; y < 192; y += 28) { g.beginPath(); g.moveTo(-4, y); g.lineTo(68, y + 34); g.stroke(); }
    return new THREE.CanvasTexture(cv);
  }

  function initCake(canvas) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    const lookAt = new THREE.Vector3(0, 1.4, 0);

    scene.add(new THREE.HemisphereLight(0xffe6f0, 0x2a0f3d, 0.85));
    const key = new THREE.DirectionalLight(0xffffff, 0.75);
    key.position.set(4, 9, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 1, far: 25 });
    scene.add(key);
    const rim = new THREE.PointLight(color3(TH.primary), 1.4, 20); rim.position.set(-5, 3, -4); scene.add(rim);
    const rim2 = new THREE.PointLight(color3(TH.secondary), 1.0, 20); rim2.position.set(5, 2, -3); scene.add(rim2);
    const candleLight = new THREE.PointLight(0xffa64d, 1.6, 9); candleLight.position.set(0, 4, 0.5); scene.add(candleLight);

    const cake = new THREE.Group();
    scene.add(cake);
    const std = (color, o) => new THREE.MeshStandardMaterial(Object.assign({ color: color3(color), roughness: 0.55, metalness: 0.05 }, o || {}));
    const goldMat = () => std(CK.gold, { metalness: 0.35, roughness: 0.3, emissive: glowOf(CK.gold) });
    const add = (geo, mat, x, y, z, parent) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x || 0, y || 0, z || 0);
      m.castShadow = true; m.receiveShadow = true;
      (parent || cake).add(m);
      return m;
    };

    // Plate
    add(new THREE.CylinderGeometry(2.75, 2.5, 0.16, 64), std(CK.plate, { metalness: 0.7, roughness: 0.2 }), 0, 0.08, 0);

    // Tier 1
    const t1h = 1.25, b1 = 0.16;
    add(new THREE.CylinderGeometry(2, 2, t1h, 64), std(CK.tier1), 0, b1 + t1h / 2, 0);
    const band = add(new THREE.TorusGeometry(2.01, 0.07, 16, 120), goldMat(), 0, b1 + 0.35, 0);
    band.rotation.x = Math.PI / 2;
    add(new THREE.CylinderGeometry(2.05, 2.05, 0.16, 64), std(CK.cream, { roughness: 0.35 }), 0, b1 + t1h - 0.02, 0);
    const cream = std(CK.cream, { roughness: 0.35 });
    const dripGeo = new THREE.SphereGeometry(0.13, 14, 14);
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      const d = add(dripGeo, cream, Math.cos(a) * 2.0, b1 + t1h - 0.2 - Math.random() * 0.15, Math.sin(a) * 2.0);
      d.scale.set(1, 1.6 + Math.random() * 1.2, 0.8);
    }
    const pearlGeo = new THREE.SphereGeometry(0.085, 12, 12);
    const pearl = std(0xffffff, { metalness: 0.4, roughness: 0.2 });
    for (let i = 0; i < 52; i++) {
      const a = (i / 52) * Math.PI * 2;
      add(pearlGeo, pearl, Math.cos(a) * 2.02, b1 + 0.08, Math.sin(a) * 2.02);
    }

    // Tier 2
    const t2h = 1.0, b2 = b1 + t1h + 0.06;
    add(new THREE.CylinderGeometry(1.35, 1.35, t2h, 64), std(CK.tier2), 0, b2 + t2h / 2, 0);
    const pinkCream = std(CK.topCream, { roughness: 0.3 });
    add(new THREE.CylinderGeometry(1.4, 1.4, 0.15, 64), pinkCream, 0, b2 + t2h - 0.02, 0);
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      const d = add(dripGeo, pinkCream, Math.cos(a) * 1.36, b2 + t2h - 0.18 - Math.random() * 0.15, Math.sin(a) * 1.36);
      d.scale.set(0.9, 1.5 + Math.random() * 1.1, 0.75);
    }
    const goldPearl = goldMat();
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      add(pearlGeo, goldPearl, Math.cos(a) * 1.37, b2 + 0.08, Math.sin(a) * 1.37);
    }
    // Little hearts around tier 2
    const smallHeart = heartGeometry(0.012);
    const heartMat = std(CK.hearts, { roughness: 0.25, metalness: 0.3 });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const h = add(smallHeart, heartMat, Math.cos(a) * 1.37, b2 + t2h * 0.5, Math.sin(a) * 1.37);
      h.lookAt(Math.cos(a) * 5, b2 + t2h * 0.5, Math.sin(a) * 5);
    }

    const top = b2 + t2h + 0.05;

    // Sprinkles
    const sprGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.13, 6);
    const sprCols = CK.sprinkles;
    for (let i = 0; i < 70; i++) {
      const r = Math.sqrt(Math.random()) * 1.2, a = Math.random() * Math.PI * 2;
      const s = add(sprGeo, std(sprCols[i % sprCols.length]), Math.cos(a) * r, top, Math.sin(a) * r);
      s.rotation.set(Math.PI / 2, 0, Math.random() * Math.PI);
    }

    // Heart topper
    const topper = add(heartGeometry(0.03), std(CK.topper, { roughness: 0.15, metalness: 0.5, emissive: glowOf(CK.topper) }), 0, top + 0.7, 0);

    // Candles
    const glowTex = glowTexture();
    const candles = [];
    const candleCols = CK.candleStripes;
    const nCandles = Math.max(1, window.CONFIG.settings.candles | 0);
    for (let i = 0; i < nCandles; i++) {
      const a = (i / nCandles) * Math.PI * 2 + Math.PI / 6;
      const g = new THREE.Group();
      g.position.set(Math.cos(a) * 0.88, top, Math.sin(a) * 0.88);
      cake.add(g);
      const cc = candleCols[i % candleCols.length];
      add(new THREE.CylinderGeometry(0.07, 0.07, 0.75, 20), new THREE.MeshStandardMaterial({ map: stripeTexture(cc[0], cc[1]), roughness: 0.5 }), 0, 0.375, 0, g);
      add(new THREE.CylinderGeometry(0.012, 0.012, 0.1, 6), std(0x222222), 0, 0.8, 0, g);

      const flame = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 16), new THREE.MeshBasicMaterial({ color: 0xffb340 }));
      flame.position.y = 0.94;
      const inner = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 12), new THREE.MeshBasicMaterial({ color: 0xfffbe6 }));
      inner.position.y = -0.015;
      flame.add(inner);
      g.add(flame);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTex, color: 0xff9a3c, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
      }));
      glow.position.y = 0.94;
      glow.scale.setScalar(0.8);
      g.add(glow);
      candles.push({ g, flame, glow, lit: true, level: 1, phase: Math.random() * 10 });
    }

    // Smoke puffs
    const smoke = [];
    function puff(c) {
      for (let k = 0; k < 6; k++) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xcccccc, transparent: true, opacity: 0.45, depthWrite: false }));
        s.position.set(c.g.position.x + (Math.random() - 0.5) * 0.05, top + 0.95 + k * 0.05, c.g.position.z);
        s.scale.setScalar(0.15);
        s.userData = { vy: 0.008 + Math.random() * 0.008, vx: (Math.random() - 0.5) * 0.006, delay: k * 6 };
        cake.add(s);
        smoke.push(s);
      }
    }

    // Sizing
    function resize() {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      const dist = camera.aspect < 1 ? 12 : camera.aspect < 1.3 ? 10.2 : 9.4;
      camera.position.set(0, 3.9, dist);
      camera.lookAt(lookAt);
      camera.updateProjectionMatrix();
    }
    resize();
    window.addEventListener('resize', resize);

    // Drag to spin
    let dragging = false, lastX = 0, spinVel = 0, tiltX = 0, tiltY = 0;
    canvas.addEventListener('pointerdown', e => { dragging = true; lastX = e.clientX; });
    window.addEventListener('pointerup', () => { dragging = false; });
    window.addEventListener('pointermove', e => {
      if (dragging) { spinVel = (e.clientX - lastX) * 0.01; lastX = e.clientX; }
      const r = canvas.getBoundingClientRect();
      tiltY = ((e.clientX - r.left) / r.width - 0.5) * 0.4;
      tiltX = ((e.clientY - r.top) / r.height - 0.5) * 0.15;
    }, { passive: true });

    // Only render while visible
    let visible = true;
    new IntersectionObserver(([en]) => { visible = en.isIntersecting; }).observe(canvas);

    const clock = new THREE.Clock();
    (function loop() {
      requestAnimationFrame(loop);
      if (!visible) return;
      const t = clock.getElapsedTime();

      spinVel *= 0.95;
      cake.rotation.y += 0.004 + spinVel;
      cake.rotation.x += (tiltX - cake.rotation.x) * 0.05;
      cake.position.y = Math.sin(t * 1.2) * 0.06;
      topper.rotation.y = t * 1.5;

      let litSum = 0;
      candles.forEach(c => {
        c.level += ((c.lit ? 1 : 0) - c.level) * 0.18;
        const f = 1 + Math.sin(t * 18 + c.phase) * 0.08 + Math.sin(t * 31 + c.phase) * 0.05;
        const L = Math.max(c.level, 0.0001);
        c.flame.scale.set(L * (1 - (f - 1) * 0.5), L * 2.1 * f, L);
        c.flame.rotation.z = Math.sin(t * 7 + c.phase) * 0.08;
        c.glow.material.opacity = c.level * (0.8 + (f - 1));
        c.flame.visible = c.glow.visible = c.level > 0.01;
        litSum += c.level;
      });
      candleLight.intensity = (litSum / nCandles) * (1.5 + Math.sin(t * 20) * 0.15);

      for (let i = smoke.length - 1; i >= 0; i--) {
        const s = smoke[i], d = s.userData;
        if (d.delay > 0) { d.delay--; s.visible = false; continue; }
        s.visible = true;
        s.position.y += d.vy;
        s.position.x += d.vx + Math.sin(t * 3 + i) * 0.002;
        s.scale.multiplyScalar(1.012);
        s.material.opacity -= 0.005;
        if (s.material.opacity <= 0) { cake.remove(s); s.material.dispose(); smoke.splice(i, 1); }
      }

      renderer.render(scene, camera);
    })();

    return {
      blow(onDone) {
        candles.forEach((c, i) => setTimeout(() => {
          c.lit = false;
          puff(c);
          if (i === candles.length - 1 && onDone) onDone();
        }, i * 140));
      },
      relight() {
        candles.forEach((c, i) => setTimeout(() => { c.lit = true; }, i * 120));
      },
      isLit: () => candles.some(c => c.lit),
      resize
    };
  }

  window.Scenes = { initBackground, initCake };
})();

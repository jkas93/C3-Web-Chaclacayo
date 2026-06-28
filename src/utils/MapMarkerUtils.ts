export function getEmergenciaIcon(tipo: string, isSelected: boolean, isCoac: boolean) {
  const size = isSelected ? 60 : 48;
  let svgContent: string;

  if (isCoac) {
    // Coacción: morado con ⚠
    svgContent = `
      <circle cx="28" cy="28" r="27" fill="#6A0DAD" opacity="0.3"/>
      <circle cx="28" cy="28" r="21" fill="#6A0DAD"/>
      <circle cx="28" cy="28" r="21" fill="none" stroke="white" stroke-width="2"/>
      <text x="28" y="34" text-anchor="middle" fill="white" font-size="16" font-weight="bold" font-family="Arial,sans-serif">⚠</text>
    `;
  } else if (tipo === 'BOMBEROS') {
    // Bomberos: naranja con llama
    svgContent = `
      <circle cx="28" cy="28" r="27" fill="#E65100" opacity="0.25"/>
      <circle cx="28" cy="28" r="21" fill="#FF5722"/>
      <circle cx="28" cy="28" r="21" fill="none" stroke="white" stroke-width="2"/>
      <text x="28" y="34" text-anchor="middle" fill="white" font-size="18" font-family="Arial,sans-serif">🔥</text>
    `;
  } else if (tipo === 'SALUD') {
    // Salud: blanco con cruz roja
    svgContent = `
      <circle cx="28" cy="28" r="27" fill="#C62828" opacity="0.15"/>
      <circle cx="28" cy="28" r="21" fill="white"/>
      <circle cx="28" cy="28" r="21" fill="none" stroke="#C62828" stroke-width="2.5"/>
      <rect x="22" y="15" width="12" height="26" rx="3" fill="#C62828"/>
      <rect x="15" y="22" width="26" height="12" rx="3" fill="#C62828"/>
    `;
  } else {
    // Policía (default): azul con SOS
    svgContent = `
      <circle cx="28" cy="28" r="27" fill="#1565C0" opacity="0.25"/>
      <circle cx="28" cy="28" r="21" fill="#1565C0"/>
      <circle cx="28" cy="28" r="21" fill="none" stroke="white" stroke-width="2"/>
      <text x="28" y="34" text-anchor="middle" fill="white" font-size="13" font-weight="bold" font-family="Arial,sans-serif">SOS</text>
    `;
  }

  return {
    size,
    htmlContent: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 56 56">${svgContent}</svg>`
  };
}

export function getUnidadIcon(tipoServicio: string, isActive: boolean, isAssigned: boolean = false) {
  const size = isAssigned ? 56 : 44;
  let htmlContent: string;



  let imgSource = '/patrulla_v3.png';
  if (tipoServicio === 'SALUD') {
    imgSource = '/ambulancia.png';
  } else if (tipoServicio === 'BOMBEROS') {
    imgSource = '/bomberos.png';
  }

  htmlContent = `
    <div class="marker-rotation-container" style="position: relative; width: ${size}px; height: ${size}px; display: flex; align-items: center; justify-content: center; transform: rotate(0deg); transition: transform 0.8s ease-out;">
      ${isAssigned ? `<div style="position: absolute; width: 100%; height: 100%; border: 3px dashed #00BFFF; border-radius: 50%; box-sizing: border-box;"></div>` : ''}
      <img src="${imgSource}" style="width: 100%; height: 100%; object-fit: contain; filter: ${isActive ? 'drop-shadow(0px 4px 6px rgba(0,0,0,0.3))' : 'grayscale(100%) opacity(70%) drop-shadow(0px 4px 6px rgba(0,0,0,0.3))'};" />
    </div>
  `;

  return {
    size,
    htmlContent
  };
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function calculateBearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const toDeg = (rad: number) => (rad * 180) / Math.PI;

  const dLng = toRad(lng2 - lng1);
  const y = Math.sin(dLng) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng);
  const brng = toDeg(Math.atan2(y, x));
  return (brng + 360) % 360;
}

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

  const pulse = isAssigned
    ? `<circle cx="26" cy="26" r="25" fill="none" stroke="#00BFFF" stroke-width="3" stroke-dasharray="4,3"/>`
    : '';

  if (tipoServicio === 'SALUD') {
    // Ambulancia top-down: blanca con cruz roja
    let svgContent = `
      ${pulse}
      <rect x="10" y="8" width="32" height="36" rx="6" fill="${isActive ? 'white' : '#90A4AE'}" stroke="#C62828" stroke-width="2"/>
      <rect x="14" y="12" width="24" height="28" rx="4" fill="${isActive ? '#FFEBEE' : '#CFD8DC'}"/>
      <rect x="20" y="16" width="12" height="20" rx="2" fill="${isActive ? 'white' : '#B0BEC5'}"/>
      <rect x="19" y="21" width="14" height="5" rx="1.5" fill="#C62828"/>
      <rect x="23" y="17" width="5" height="13" rx="1.5" fill="#C62828"/>
      <rect x="12" y="36" width="9" height="6" rx="2" fill="${isActive ? '#CFD8DC' : '#90A4AE'}"/>
      <rect x="31" y="36" width="9" height="6" rx="2" fill="${isActive ? '#CFD8DC' : '#90A4AE'}"/>
    `;
    htmlContent = `<div class="marker-rotation-container" style="width: ${size}px; height: ${size}px; transform: rotate(0deg); transition: transform 0.8s ease-out;"><svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 52 52">${svgContent}</svg></div>`;
  } else if (tipoServicio === 'BOMBEROS') {
    // Camión bomberos top-down: rojo
    let svgContent = `
      ${pulse}
      <rect x="8" y="6" width="36" height="40" rx="6" fill="${isActive ? '#C62828' : '#78909C'}" stroke="#B71C1C" stroke-width="2"/>
      <rect x="12" y="10" width="28" height="32" rx="4" fill="${isActive ? '#E53935' : '#90A4AE'}"/>
      <rect x="14" y="12" width="24" height="14" rx="3" fill="${isActive ? '#FFEBEE' : '#B0BEC5'}"/>
      <text x="26" y="23" text-anchor="middle" fill="${isActive ? '#C62828' : '#607D8B'}" font-size="10" font-weight="bold" font-family="Arial,sans-serif">🚒</text>
      <rect x="14" y="30" width="10" height="10" rx="2" fill="${isActive ? '#FFCDD2' : '#CFD8DC'}"/>
      <rect x="28" y="30" width="10" height="10" rx="2" fill="${isActive ? '#FFCDD2' : '#CFD8DC'}"/>
      <circle cx="16" cy="42" r="4" fill="${isActive ? '#37474F' : '#546E7A'}"/>
      <circle cx="36" cy="42" r="4" fill="${isActive ? '#37474F' : '#546E7A'}"/>
    `;
    htmlContent = `<div class="marker-rotation-container" style="width: ${size}px; height: ${size}px; transform: rotate(0deg); transition: transform 0.8s ease-out;"><svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 52 52">${svgContent}</svg></div>`;
  } else {
    // Patrulla policial top-down: imagen PNG personalizada
    htmlContent = `
      <div class="marker-rotation-container" style="position: relative; width: ${size}px; height: ${size}px; display: flex; align-items: center; justify-content: center; transform: rotate(0deg); transition: transform 0.8s ease-out;">
        ${isAssigned ? `<div style="position: absolute; width: 100%; height: 100%; border: 3px dashed #00BFFF; border-radius: 50%; box-sizing: border-box;"></div>` : ''}
        <img src="/auto-policia-v2.png" style="width: 100%; height: 100%; object-fit: contain; filter: ${isActive ? 'drop-shadow(0px 4px 6px rgba(0,0,0,0.3))' : 'grayscale(100%) opacity(70%) drop-shadow(0px 4px 6px rgba(0,0,0,0.3))'};" />
      </div>
    `;
  }

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

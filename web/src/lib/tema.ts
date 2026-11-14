/** Se ejecuta antes de pintar la página para que no parpadee el tema equivocado */
export const SCRIPT_TEMA = `try{var t=localStorage.getItem('asa.tema')||(matchMedia('(prefers-color-scheme: dark)').matches?'noche':'dia');document.documentElement.dataset.tema=t}catch(e){}`;

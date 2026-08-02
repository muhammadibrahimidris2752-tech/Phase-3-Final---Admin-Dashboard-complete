/* Small, dependency-light helpers shared across modules. */
import { WHATSAPP_NUMBER } from './config.js';

export function formatNaira(n){ return '₦' + Math.round(n).toLocaleString('en-NG'); }

/** Shared wa.me link builder — both the header contact link and the cart's order link use this. */
export function buildWaLink(msg){
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;
}

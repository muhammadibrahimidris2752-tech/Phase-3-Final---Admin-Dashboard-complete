/* Site configuration. This is the one file to edit when reusing this
   codebase for a different store/client — brand name, WhatsApp number,
   contact email, and the EmailJS + order-code settings all live here. */

/* ============ CONFIG — replace these for your own store ============ */
export const BRAND_NAME = 'Kitchen & Home By Noor';
export const WHATSAPP_NUMBER = '2349030630374'; // your number 09030630374, converted to international format for wa.me links
export const CONTACT_EMAIL = 'kitchen&homebynoor@gmail.com';

// EmailJS sends a copy of every order to CONTACT_EMAIL above, with no backend needed.
// Sign up free at emailjs.com, connect an email address, make a template, then paste
// your three IDs below. Until these are filled in, order emails are silently skipped —
// nothing else on the site is affected.
export const EMAILJS_PUBLIC_KEY = '8CDzU8fi9ICe8pAot';     // Account → General → Public Key
export const EMAILJS_SERVICE_ID = 'service_p58ue4u';       // Email Services → your connected service
export const EMAILJS_TEMPLATE_ID = 'template_fvgvemm';     // Email Templates → your admin template
export const EMAILJS_CUSTOMER_TEMPLATE_ID = 'template_lvbcg8p'; // a second template — see README for the fields it needs

// Used to generate the order verification code shown in the WhatsApp message
// and on the Verify Order (staff) page — see js/checkout.js and js/admin.js.
export const ORDER_CODE_SALT = 'KHN-2026-CHANGE-ME'; // change this to any private string of your own

// PLACEHOLDER — set this to your real flat delivery fee (in Naira, no
// separators) before going live. Automatically added to the order total
// at checkout when a customer chooses Delivery; never charged for Pickup.
// See js/checkout.js (getOrderTotal, fulfilmentSectionHTML).
export const DELIVERY_CHARGE = 1500;

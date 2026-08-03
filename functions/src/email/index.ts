/**
 * Email — transactional customer/admin notifications.
 *
 * Planned for Phase 4 Step 4, per the approved decision: move email
 * sending off the browser-only EmailJS SDK (js/checkout.js today) and
 * on to EmailJS's plain REST endpoint, called from here instead, so
 * confirmations only ever go out after a payment is actually verified
 * — never on click, the way today's flow fires them. Same service/
 * template IDs the frontend already uses (js/config.js), just called
 * from a trusted place instead of the customer's browser.
 *
 * Empty for now — Step 2 only scaffolds the Cloud Functions project
 * structure and ships one unrelated proof-of-pipeline function
 * (src/health).
 */
export {};

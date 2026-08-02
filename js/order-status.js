/* ============================================================
   The ONE canonical order-status model for the whole project.
   Every place that shows or sets an order's status — the customer
   Orders/tracking page (js/order-tracking.js), the admin Orders
   filter (admin/index.html), and Firestore writes (js/firestore.js,
   js/admin.js) — imports from here instead of hardcoding its own
   list, so there is only ever one status vocabulary in the app.

   Delivery and Pickup orders follow different real-world timelines
   (a pickup order never goes "in transit"), so each fulfilment
   method has its own ordered TIMELINE. The 4 "My Orders" tabs are a
   simplified view over both timelines — see getOrderTab() below for
   exactly how each granular status maps to a tab.
   ============================================================ */

export const ORDER_STATUS = {
  CONFIRMED: 'confirmed',
  PROCESSING: 'processing',
  IN_TRANSIT: 'in_transit',
  OUT_FOR_DELIVERY: 'out_for_delivery',
  READY_FOR_PICKUP: 'ready_for_pickup',
  DELIVERED: 'delivered',
  PICKED_UP: 'picked_up',
  CANCELLED: 'cancelled'
};

export const ORDER_STATUS_LABEL = {
  [ORDER_STATUS.CONFIRMED]: 'Order Confirmed',
  [ORDER_STATUS.PROCESSING]: 'Processing',
  [ORDER_STATUS.IN_TRANSIT]: 'In Transit',
  [ORDER_STATUS.OUT_FOR_DELIVERY]: 'Out for Delivery',
  [ORDER_STATUS.READY_FOR_PICKUP]: 'Ready for Pickup',
  [ORDER_STATUS.DELIVERED]: 'Delivered',
  [ORDER_STATUS.PICKED_UP]: 'Picked Up',
  [ORDER_STATUS.CANCELLED]: 'Cancelled'
};

// Approved Phase 1 timelines — one per fulfilment method.
export const DELIVERY_TIMELINE = [
  ORDER_STATUS.CONFIRMED,
  ORDER_STATUS.PROCESSING,
  ORDER_STATUS.IN_TRANSIT,
  ORDER_STATUS.OUT_FOR_DELIVERY,
  ORDER_STATUS.DELIVERED
];
export const PICKUP_TIMELINE = [
  ORDER_STATUS.CONFIRMED,
  ORDER_STATUS.PROCESSING,
  ORDER_STATUS.READY_FOR_PICKUP,
  ORDER_STATUS.PICKED_UP
];

export function getTimelineFor(order){
  return order.fulfillment === 'pickup' ? PICKUP_TIMELINE : DELIVERY_TIMELINE;
}

// The 4 approved "My Orders" filter tabs.
export const ORDER_TABS = ['All', 'Processing', 'In Transit', 'Delivered'];

/** Which tab a given status falls under. Delivery's "In Transit"/"Out for
    Delivery" and Pickup's "Ready for Pickup" all bucket into the "In
    Transit" tab (all three mean "on its way, not yet in the customer's
    hands"); "Delivered" and "Picked Up" both bucket into "Delivered"
    (both mean "the customer has it"). Statuses with no tab of their own
    (e.g. Cancelled) return null and only ever show under "All". */
export function getOrderTab(status){
  switch(status){
    case ORDER_STATUS.CONFIRMED:
    case ORDER_STATUS.PROCESSING:
      return 'Processing';
    case ORDER_STATUS.IN_TRANSIT:
    case ORDER_STATUS.OUT_FOR_DELIVERY:
    case ORDER_STATUS.READY_FOR_PICKUP:
      return 'In Transit';
    case ORDER_STATUS.DELIVERED:
    case ORDER_STATUS.PICKED_UP:
      return 'Delivered';
    default:
      return null;
  }
}

const dateTimeFormat = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "medium",
  timeStyle: "short",
});

const dateFormat = new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium" });

/** Formatted on the server (single-user local app: server and browser share a time zone). */
export function formatDateTime(date: Date): string {
  return dateTimeFormat.format(date);
}

export function formatDate(date: Date): string {
  return dateFormat.format(date);
}

/**
 * Vietnamese UI strings — the app's default (and currently only) locale.
 * Keep user-facing copy here instead of inline in components so a real i18n
 * library can be dropped in later by swapping this dictionary per locale.
 */
export const vi = {
  app: {
    name: "OC Studio",
    tagline: "Xưởng sáng tác nhân vật",
    description: "Tạo, quản lý và biên tập hồ sơ nhân vật cho viết truyện và roleplay.",
  },
  nav: {
    groupLabel: "Không gian làm việc",
    dashboard: "Tổng quan",
    characters: "Thư viện nhân vật",
    collections: "Bộ sưu tập",
    templates: "Mẫu hồ sơ",
    settings: "Cài đặt",
    toggleSidebar: "Thu gọn / mở rộng thanh bên",
    mainNavigation: "Điều hướng chính",
  },
  common: {
    comingSoon: "Sắp có",
    notAvailableYet: "Chức năng này sẽ khả dụng ở giai đoạn tiếp theo.",
  },
  theme: {
    label: "Giao diện",
    toggle: "Đổi giao diện",
    light: "Sáng",
    dark: "Tối",
    system: "Theo hệ thống",
  },
  dashboard: {
    title: "OC Studio",
    welcomeTitle: "Chào mừng trở lại xưởng sáng tác",
    welcomeBody:
      "Nơi lưu giữ những nhân vật bạn tạo ra — từ tiểu sử, tính cách đến các mối quan hệ — để dùng cho truyện và roleplay.",
    openLibrary: "Mở thư viện nhân vật",
    statusTitle: "Trạng thái ứng dụng",
    statusDescription: "Tình trạng các thành phần nền tảng.",
    recentTitle: "Nhân vật gần đây",
    emptyTitle: "Chưa có nhân vật nào",
    emptyBody:
      "Khi chức năng tạo nhân vật sẵn sàng, những nhân vật bạn chỉnh sửa gần đây sẽ xuất hiện tại đây.",
  },
  status: {
    application: "Ứng dụng",
    applicationReady: "Đang chạy",
    database: "PostgreSQL",
    checking: "Đang kiểm tra…",
    connected: "Đã kết nối",
    notConfigured: "Chưa cấu hình",
    notConfiguredHint:
      "Tạo file .env.local với DATABASE_URL (xem .env.example), rồi khởi động lại.",
    error: "Lỗi kết nối",
    environment: "Môi trường",
    version: "Phiên bản",
  },
  characters: {
    title: "Thư viện nhân vật",
    description: "Tất cả nhân vật gốc (OC) của bạn ở một nơi.",
    create: "Tạo nhân vật",
    searchPlaceholder: "Tìm theo tên, thẻ…",
    searchLabel: "Tìm kiếm nhân vật",
    emptyTitle: "Thư viện đang trống",
    emptyBody:
      "Chức năng tạo và quản lý nhân vật sẽ được bổ sung ở giai đoạn tiếp theo. Danh sách nhân vật sẽ hiển thị tại đây.",
    untitled: "Nhân vật chưa đặt tên",
    updatedAt: "Cập nhật",
  },
  collections: {
    title: "Bộ sưu tập",
    description: "Nhóm nhân vật theo thế giới, câu chuyện hoặc chiến dịch roleplay.",
    placeholderTitle: "Bộ sưu tập sẽ sớm có mặt",
    placeholderBody:
      "Bạn sẽ có thể gom các nhân vật cùng một thế giới hoặc cùng một câu chuyện vào chung một bộ sưu tập.",
  },
  templates: {
    title: "Mẫu hồ sơ",
    description: "Cấu trúc hồ sơ dùng lại khi tạo nhân vật mới.",
    placeholderTitle: "Nơi quản lý mẫu hồ sơ",
    placeholderBody:
      "Mẫu hồ sơ quy định những mục thông tin của một nhân vật. Bạn sẽ có thể tạo, chỉnh sửa và chọn mẫu phù hợp cho từng thể loại.",
  },
  settings: {
    title: "Cài đặt",
    description: "Tùy chỉnh trải nghiệm OC Studio.",
    appearanceTitle: "Giao diện",
    appearanceDescription: "Chọn chế độ sáng, tối hoặc theo cài đặt của hệ điều hành.",
    aiTitle: "Trợ lý AI",
    aiDescription: "Kết nối mô hình AI để hỗ trợ phát triển nhân vật.",
    languageTitle: "Ngôn ngữ",
    languageDescription: "Ngôn ngữ hiển thị của ứng dụng.",
    languageCurrent: "Tiếng Việt",
    dataTitle: "Dữ liệu",
    dataDescription: "Sao lưu, xuất và nhập dữ liệu nhân vật.",
  },
  notFound: {
    title: "Không tìm thấy trang",
    body: "Trang bạn tìm không tồn tại hoặc đã được di chuyển.",
    back: "Về trang tổng quan",
  },
} as const;

export type Messages = typeof vi;

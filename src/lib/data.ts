// Gateways have been moved to the database.
// Use getGateways() server action instead.

export const transactions = [
  {
    id: "TX-9021",
    customer: "Amadou Diallo",
    amount: "25,000 FCFA",
    gateway: "PayDunya",
    status: "completed",
    date: "2024-03-15 14:30",
    method: "Mobile Money",
  },
  {
    id: "TX-9022",
    customer: "Koffi Mensah",
    amount: "15,000 GHS",
    gateway: "Flutterwave",
    status: "pending",
    date: "2024-03-15 14:35",
    method: "Card",
  },
  {
    id: "TX-9023",
    customer: "Blandine Traore",
    amount: "10,000 XOF",
    gateway: "CinetPay",
    status: "failed",
    date: "2024-03-15 14:40",
    method: "Mobile Money",
  },
  {
    id: "TX-9024",
    customer: "Zanele Mbeki",
    amount: "500 ZAR",
    gateway: "PawaPay",
    status: "completed",
    date: "2024-03-15 14:45",
    method: "Bank Transfer",
  },
  {
    id: "TX-9025",
    customer: "Saliou Ndiaye",
    amount: "75,000 FCFA",
    gateway: "Moneroo",
    status: "completed",
    date: "2024-03-15 14:50",
    method: "Mobile Money",
  },
];

export const volumeData = [
  { name: "Mon", total: 4500 },
  { name: "Tue", total: 5200 },
  { name: "Wed", total: 4800 },
  { name: "Thu", total: 6100 },
  { name: "Fri", total: 5900 },
  { name: "Sat", total: 4300 },
  { name: "Sun", total: 3800 },
];

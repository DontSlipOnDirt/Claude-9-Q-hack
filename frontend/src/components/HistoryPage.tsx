import { Download, FileText } from "lucide-react";
import { pastOrders, recurringPurchaseHistory } from "@/data/meals";

const HistoryPage = () => {
  return (
    <div className="max-w-6xl mx-auto w-full px-4 py-6">
      {/* Recurring items chart */}
      <h2 className="text-xl font-bold text-foreground mb-4">Recurring Purchases</h2>
      <div className="bg-card border border-border rounded-xl p-4 mb-8 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-2 pr-4 text-muted-foreground font-medium">Product</th>
              <th className="text-left py-2 px-3 text-muted-foreground font-medium">Last Purchased</th>
              <th className="text-left py-2 px-3 text-muted-foreground font-medium">Avg. Usage</th>
            </tr>
          </thead>
          <tbody>
            {recurringPurchaseHistory.map((item) => (
              <tr key={item.name} className="border-b border-border last:border-0">
                <td className="py-3 pr-4 font-medium text-foreground">{item.name}</td>
                <td className="py-3 px-3 text-muted-foreground text-xs">{item.lastPurchased}</td>
                <td className="py-3 px-3">
                  <span className="text-xs font-medium text-accent bg-accent/10 px-2 py-0.5 rounded-full">
                    ~{item.avgUsageDays} days
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Past orders */}
      <h2 className="text-xl font-bold text-foreground mb-4">Orders</h2>
      <div className="space-y-3">
        {pastOrders.map((order) => (
          <div key={order.id} className="bg-card border border-border rounded-xl p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center">
              <FileText className="w-5 h-5 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-foreground">Order #{order.id.replace("ord", "")}</p>
                {order.status === "delivered" ? (
                  <span className="text-[10px] bg-accent/10 text-accent px-2 py-0.5 rounded-full font-medium">Delivered</span>
                ) : (
                  <span className="text-[10px] bg-destructive/10 text-destructive px-2 py-0.5 rounded-full font-medium">Cancelled</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{order.date} · {order.items} items</p>
            </div>
            <p className="text-sm font-bold text-foreground">{order.total.toFixed(2).replace(".", ",")} €</p>
            <button className="p-2 hover:bg-muted rounded-lg transition-colors" title="Download invoice">
              <Download className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default HistoryPage;

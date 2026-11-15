import { useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TextField } from "@/components/shared/Field";
import { errorText } from "@/lib/api";
import { recordDelivery } from "@/server/functions/documents";

type Row = Record<string, string | number | boolean | null>;

/** Record copies dispatched against an approved sales order (follow-up only; no postings). */
export function DeliveryDialog({
  orderId,
  docNo,
  lines,
  today,
  onClose,
}: {
  orderId: string;
  docNo: string;
  lines: Row[];
  today: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const open = lines.map((l) => ({
    id: String(l["id"]),
    name: String(l["productName"] ?? l["description"] ?? ""),
    left: Number(l["qty"]) - Number(l["delivered"] ?? 0),
  }));
  const [qty, setQty] = useState<Record<string, number>>(() =>
    Object.fromEntries(open.map((l) => [l.id, l.left])),
  );
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await recordDelivery({
        data: {
          orderId,
          date,
          note,
          lines: open.map((l) => ({ lineId: l.id, qty: qty[l.id] ?? 0 })),
        },
      });
      toast.success(`Delivery recorded on ${docNo}`);
      await qc.invalidateQueries();
      onClose();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Record delivery · {docNo}</DialogTitle>
          <DialogDescription>
            Copies dispatched to the customer. This is for follow-up only; stock and accounts move
            with the invoice.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="Delivery date" type="date" value={date} onChange={setDate} />
          <TextField label="Note (vehicle, courier, DC no.)" value={note} onChange={setNote} />
        </div>
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-2 py-1.5">Book</th>
              <th className="w-28 px-2 py-1.5 text-right">Left to deliver</th>
              <th className="w-32 px-2 py-1.5">Delivered now</th>
            </tr>
          </thead>
          <tbody>
            {open.map((l) => (
              <tr key={l.id} className="border-t">
                <td className="px-2 py-1.5">{l.name}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{l.left}</td>
                <td className="px-2 py-1">
                  <Input
                    type="number"
                    min={0}
                    max={l.left}
                    aria-label={`Delivered ${l.name}`}
                    disabled={l.left <= 0}
                    value={qty[l.id] ?? 0}
                    onChange={(e) =>
                      setQty({
                        ...qty,
                        [l.id]: Math.min(
                          l.left,
                          Math.max(0, Math.trunc(Number(e.target.value || 0))),
                        ),
                      })
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button disabled={busy} onClick={() => void save()}>
            Save delivery
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

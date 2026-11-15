import { useState } from "react";
import { Check, Pencil, Plus, Power, Tags, Trash2, X } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Field } from "@/components/shared/Field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { errorText, useApi } from "@/lib/api";
import { useLookups } from "@/lib/lookups";
import { useSession } from "@/lib/session";
import { listCategories, removeCategory, saveCategory } from "@/server/functions/masters";
import { CATEGORY_KINDS, type CategoryKind } from "@/shared/masters";

/** Active categories of a kind, for dropdowns (plus `keep`, so an old value still shows). */
export function useCategoryOptions(kind: CategoryKind, keep?: string | null) {
  const { data: lk } = useLookups();
  const list = (lk?.categories ?? []).filter((c) => c.kind === kind);
  const names = list.filter((c) => c.status === "Active").map((c) => c.name);
  if (keep && !names.some((n) => n.toLowerCase() === keep.toLowerCase())) names.push(keep);
  return names;
}

/** Category dropdown with a quick "+ New" for users allowed to manage that list. */
export function CategorySelect({
  kind,
  label,
  value,
  onChange,
  required,
  className,
}: {
  kind: CategoryKind;
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  className?: string;
}) {
  const { can } = useSession();
  const qc = useQueryClient();
  const options = useCategoryOptions(kind, value);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const canAdd = can(CATEGORY_KINDS[kind].perm);
  const id = `cat-${kind}`;

  const add = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await saveCategory({ data: { kind, name: name.trim() } });
      await qc.invalidateQueries({ queryKey: ["lookups"] });
      onChange(name.trim());
      toast.success(`${CATEGORY_KINDS[kind].singular} "${name.trim()}" added`);
      setName("");
      setAdding(false);
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Field label={required ? `${label} *` : label} htmlFor={id} className={className}>
      {adding ? (
        <div className="flex gap-1">
          <Input
            autoFocus
            value={name}
            placeholder={`New ${CATEGORY_KINDS[kind].singular.toLowerCase()}`}
            aria-label={`New ${CATEGORY_KINDS[kind].singular}`}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void add();
              }
              if (e.key === "Escape") setAdding(false);
            }}
          />
          <Button
            type="button"
            size="icon"
            disabled={busy}
            onClick={() => void add()}
            aria-label="Add"
          >
            <Check className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={() => setAdding(false)}
            aria-label="Cancel"
          >
            <X className="size-4" />
          </Button>
        </div>
      ) : (
        <div className="flex gap-1">
          <Select value={value ?? ""} onValueChange={onChange}>
            <SelectTrigger id={id}>
              <SelectValue placeholder="Choose…" />
            </SelectTrigger>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o} value={o}>
                  {o}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {canAdd && (
            <Button
              type="button"
              size="icon"
              variant="outline"
              title={`Add a new ${CATEGORY_KINDS[kind].singular.toLowerCase()}`}
              aria-label={`Add ${CATEGORY_KINDS[kind].singular}`}
              onClick={() => setAdding(true)}
            >
              <Plus className="size-4" />
            </Button>
          )}
        </div>
      )}
    </Field>
  );
}

/** Header button that opens the full add / rename / retire / delete screen for category lists. */
export function ManageCategoriesButton({ kinds }: { kinds: CategoryKind[] }) {
  const { can } = useSession();
  const [open, setOpen] = useState(false);
  const allowed = kinds.filter((k) => can(CATEGORY_KINDS[k].perm));
  if (!allowed.length) return null;
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Tags />
        Manage categories
      </Button>
      {open && (
        <Dialog open onOpenChange={(o) => !o && setOpen(false)}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Categories</DialogTitle>
              <DialogDescription>
                Add, rename or retire categories. Renaming updates every record that uses the old
                name. A category in use cannot be deleted, but you can deactivate it so it is no
                longer offered for new entries.
              </DialogDescription>
            </DialogHeader>
            {allowed.length === 1 ? (
              <CategoryList kind={allowed[0]!} />
            ) : (
              <Tabs defaultValue={allowed[0]}>
                <TabsList>
                  {allowed.map((k) => (
                    <TabsTrigger key={k} value={k}>
                      {CATEGORY_KINDS[k].label}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {allowed.map((k) => (
                  <TabsContent key={k} value={k}>
                    <CategoryList kind={k} />
                  </TabsContent>
                ))}
              </Tabs>
            )}
            <DialogFooter>
              <Button onClick={() => setOpen(false)}>Done</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

type Cat = { id: string; name: string; status: string; used: number };

function CategoryList({ kind }: { kind: CategoryKind }) {
  const qc = useQueryClient();
  const q = useApi(["categories", kind], () => listCategories({ data: { kind } }));
  const [newName, setNewName] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [busy, setBusy] = useState(false);
  const rows = (q.data ?? []) as unknown as Cat[];

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      await qc.invalidateQueries();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const name = newName.trim();
          if (!name) return;
          void run(() => saveCategory({ data: { kind, name } }), `"${name}" added`).then(() =>
            setNewName(""),
          );
        }}
      >
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={`New ${CATEGORY_KINDS[kind].singular.toLowerCase()}…`}
          aria-label={`New ${CATEGORY_KINDS[kind].singular}`}
        />
        <Button type="submit" disabled={busy || !newName.trim()}>
          <Plus />
          Add
        </Button>
      </form>
      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2 text-right">Records</th>
              <th className="px-3 py-2">Status</th>
              <th className="w-32 px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {q.isLoading && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            )}
            {rows.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="px-3 py-1.5">
                  {editId === c.id ? (
                    <Input
                      autoFocus
                      value={editName}
                      aria-label="Category name"
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") setEditId(null);
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void run(
                            () => saveCategory({ data: { kind, id: c.id, name: editName.trim() } }),
                            "Renamed",
                          ).then(() => setEditId(null));
                        }
                      }}
                    />
                  ) : (
                    <span className="font-medium">{c.name}</span>
                  )}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">{c.used}</td>
                <td className="px-3 py-1.5">
                  <StatusBadge status={c.status} />
                </td>
                <td className="px-3 py-1.5">
                  <div className="flex justify-end gap-1">
                    {editId === c.id ? (
                      <>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Save name"
                          disabled={busy}
                          onClick={() =>
                            void run(
                              () =>
                                saveCategory({ data: { kind, id: c.id, name: editName.trim() } }),
                              "Renamed",
                            ).then(() => setEditId(null))
                          }
                        >
                          <Check className="size-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Cancel rename"
                          onClick={() => setEditId(null)}
                        >
                          <X className="size-4" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Rename"
                          aria-label={`Rename ${c.name}`}
                          onClick={() => {
                            setEditId(c.id);
                            setEditName(c.name);
                          }}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          title={c.status === "Active" ? "Deactivate" : "Activate"}
                          aria-label={`${c.status === "Active" ? "Deactivate" : "Activate"} ${c.name}`}
                          disabled={busy}
                          onClick={() =>
                            void run(
                              () =>
                                removeCategory({
                                  data: {
                                    kind,
                                    id: c.id,
                                    action: c.status === "Active" ? "deactivate" : "activate",
                                  },
                                }),
                              c.status === "Active" ? "Deactivated" : "Activated",
                            )
                          }
                        >
                          <Power
                            className={`size-4 ${c.status === "Active" ? "text-amber-600" : "text-success"}`}
                          />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          title={c.used ? "In use: deactivate instead" : "Delete"}
                          aria-label={`Delete ${c.name}`}
                          disabled={busy || c.used > 0}
                          onClick={() =>
                            void run(
                              () => removeCategory({ data: { kind, id: c.id, action: "delete" } }),
                              `"${c.name}" deleted`,
                            )
                          }
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

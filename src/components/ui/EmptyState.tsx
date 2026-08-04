import { Upload } from "lucide-react";
import { motion } from "framer-motion";

export default function EmptyState({
  title = "Keine Einträge vorhanden",
  hint = "Ziehe Dateien hierher oder klicke zum Hochladen.",
}: {
  title?: string;
  hint?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="py-16 text-center"
    >
      <Upload className="mx-auto mb-4 h-12 w-12 text-muted-foreground opacity-30" />
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
    </motion.div>
  );
}

import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

export interface LabelData {
  productName: string;
  size: string;
  color: string;
  barcode: string;
  price: number;
}

function LabelSvg({ label }: { label: LabelData }) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (svgRef.current) {
      JsBarcode(svgRef.current, label.barcode, {
        format: "CODE128",
        width: 1.6,
        height: 40,
        fontSize: 12,
        margin: 4,
        displayValue: true,
      });
    }
  }, [label.barcode]);

  return (
    <div className="label-print-item flex w-56 flex-col items-center border border-dashed border-black p-2 text-center text-black">
      <p className="w-full truncate text-[11px] font-semibold">{label.productName}</p>
      <p className="text-[10px]">
        {label.size} / {label.color} — ₹{label.price.toFixed(2)}
      </p>
      <svg ref={svgRef} />
    </div>
  );
}

// A visually-hidden sheet of labels; window.print() picks it up via the
// same "hidden-until-print" pattern as the POS receipt.
export function BarcodeLabelSheet({ labels }: { labels: LabelData[] }) {
  if (!labels.length) return null;
  return (
    <div className="label-print-area flex flex-wrap gap-2 bg-white p-4">
      {labels.map((label, i) => (
        <LabelSvg key={i} label={label} />
      ))}
    </div>
  );
}

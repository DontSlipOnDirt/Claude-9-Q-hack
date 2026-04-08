import { useState } from "react";
import { X, Clock } from "lucide-react";
import { deliverySlots } from "@/data/meals";

interface DeliverySlotPickerProps {
  isOpen: boolean;
  onClose: () => void;
  selectedSlot: string;
  onSelectSlot: (slot: string) => void;
}

const DeliverySlotPicker = ({ isOpen, onClose, selectedSlot, onSelectSlot }: DeliverySlotPickerProps) => {
  const [activeDay, setActiveDay] = useState(0);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md bg-card rounded-2xl flex flex-col overflow-hidden shadow-xl animate-in slide-in-from-bottom">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-picnic-green" />
            <h3 className="font-bold text-foreground text-lg">Lieferzeitfenster</h3>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>

        {/* Day tabs */}
        <div className="flex gap-1 px-4 pt-3 overflow-x-auto scrollbar-hide">
          {deliverySlots.map((day, i) => (
            <button
              key={day.date}
              onClick={() => setActiveDay(i)}
              className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                activeDay === i ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
              }`}
            >
              {day.date}
            </button>
          ))}
        </div>

        {/* Slots */}
        <div className="px-4 pt-4 pb-6 grid grid-cols-2 gap-2">
          {deliverySlots[activeDay].slots.map((slot) => {
            const fullSlot = `${deliverySlots[activeDay].date} ${slot}`;
            const isSelected = selectedSlot === fullSlot;
            return (
              <button
                key={slot}
                onClick={() => { onSelectSlot(fullSlot); onClose(); }}
                className={`py-3 rounded-xl text-sm font-medium border transition-colors ${
                  isSelected
                    ? "border-picnic-green bg-picnic-green/10 text-picnic-green"
                    : "border-border text-foreground hover:border-picnic-green/50"
                }`}
              >
                {slot}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default DeliverySlotPicker;

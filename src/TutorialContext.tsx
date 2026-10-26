import { createContext, useContext } from "react";
import { Icon } from "./icons";

export const TutorialContext = createContext(() => {});

export function TutorialButton() {
  const open = useContext(TutorialContext);
  return (
    <button className="quiet-button" onClick={open}>
      <Icon name="notes" size={15} /> Tutorial
    </button>
  );
}

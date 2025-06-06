import { useContext } from "react";
import { AppContext } from "../context/app-provider";

export default function Search() {
  const { search, setSearch } = useContext(AppContext);
  return (
    <input
      autoFocus
      className="input"
      style={{ width: "calc(100% - 30px)" }}
      value={search}
      onInput={(e) => setSearch(e.target.value)}
      type="text"
      placeholder="search... (type/name/date)"
    />
  );
}

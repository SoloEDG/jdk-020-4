import type { Flight } from "../../../shared/types";
import { boardCloseOf } from "../../connections";

function row(flight: Omit<Flight, "boardCloseAt">): Flight {
  return { ...flight, boardCloseAt: boardCloseOf(flight as Flight) };
}

export function initialFlights(): Flight[] {
  return [
    row({
      id: "MU2451",
      airline: "东方航空",
      from: "上海 · SHA",
      destination: "成都 · CTU",
      aircraft: "A320",
      size: "narrow",
      arrival: 0,
      deadline: 270,
      passengers: 156,
      status: "incoming",
      color: "#e46e49",
    }),
    row({
      id: "CZ3088",
      airline: "南方航空",
      from: "广州 · CAN",
      destination: "北京 · PEK",
      aircraft: "B787",
      size: "wide",
      arrival: 0,
      deadline: 340,
      passengers: 248,
      status: "incoming",
      color: "#397c9b",
    }),
    row({
      id: "CA1833",
      airline: "中国国航",
      from: "北京 · PEK",
      destination: "厦门 · XMN",
      aircraft: "B737",
      size: "narrow",
      arrival: 0,
      deadline: 390,
      passengers: 172,
      status: "incoming",
      color: "#c75448",
    }),
    row({
      id: "HU7602",
      airline: "海南航空",
      from: "海口 · HAK",
      destination: "杭州 · HGH",
      aircraft: "A320",
      size: "narrow",
      arrival: 70,
      deadline: 430,
      passengers: 148,
      status: "scheduled",
      color: "#b78a40",
    }),
    row({
      id: "MF8219",
      airline: "厦门航空",
      from: "厦门 · XMN",
      destination: "上海 · SHA",
      aircraft: "B737",
      size: "narrow",
      arrival: 140,
      deadline: 500,
      passengers: 164,
      status: "scheduled",
      color: "#4683a6",
    }),
    row({
      id: "3U8866",
      airline: "四川航空",
      from: "成都 · CTU",
      destination: "深圳 · SZX",
      aircraft: "A350",
      size: "wide",
      arrival: 210,
      deadline: 580,
      passengers: 286,
      status: "scheduled",
      color: "#b85d58",
    }),
  ];
}

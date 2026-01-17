export interface ShippingCost {
  service: string;
  description: string;
  cost: number;
  etd: string;
  courier: string;
}

export interface City {
  cityId: string;
  cityName: string;
  province: string;
  type: string;
  postalCode: string;
}

export interface IRajaOngkirService {
  checkShippingCost(origin: string, destination: string, weight?: number, courier?: string): Promise<ShippingCost[]>;
  searchCity(query: string): Promise<City | null>;
  getCities(): Promise<City[]>;
  formatShippingCostReply(costs: ShippingCost[]): string;
}

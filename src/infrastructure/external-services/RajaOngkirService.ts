import { injectable } from 'inversify';
import axios, { AxiosInstance } from 'axios';
import { IRajaOngkirService, ShippingCost, City } from '@application/interfaces/services/IRajaOngkirService';
import { env } from '@shared/config/env';

@injectable()
export class RajaOngkirService implements IRajaOngkirService {
  private client: AxiosInstance;
  private citiesCache: City[] = [];
  private cacheExpiry: number = 0;
  private readonly CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

  constructor() {
    this.client = axios.create({
      baseURL: 'https://rajaongkir.komerce.id/api/v1',
      headers: {
        'key': env.rajaongkirApiKeyShipping,
      },
    });
  }

  async checkShippingCost(
    origin: string,
    destination: string,
    weight: number = 1000,
    courier: string = 'jne'
  ): Promise<ShippingCost[]> {
    try {
      // Search for cities
      const originCity = await this.searchCity(origin);
      const destCity = await this.searchCity(destination);

      if (!originCity) {
        throw new Error(`Kota asal "${origin}" tidak ditemukan`);
      }

      if (!destCity) {
        throw new Error(`Kota tujuan "${destination}" tidak ditemukan`);
      }

      console.log(`Checking shipping cost: ${originCity.cityName} → ${destCity.cityName} (${weight}g, ${courier})`);

      // Use RajaOngkir official API for cost calculation
      try {
        console.log(`📦 Using RajaOngkir API: ${originCity.cityId} → ${destCity.cityId}`);

        // Create form-urlencoded data
        const params = new URLSearchParams();
        params.append('origin', originCity.cityId);
        params.append('destination', destCity.cityId);
        params.append('weight', weight.toString());
        params.append('courier', courier);

        const response = await this.client.post('/calculate/domestic-cost', params, {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        });

        const data = response.data?.data;

        if (!data || data.length === 0) {
          throw new Error('Tidak ada layanan pengiriman tersedia');
        }

        const costs: ShippingCost[] = [];

        for (const item of data) {
          costs.push({
            courier: item.name,
            service: item.service,
            description: item.description,
            cost: item.cost,
            etd: item.etd,
          });
        }

        console.log(`✅ Found ${costs.length} shipping options from RajaOngkir`);
        return costs;
      } catch (apiError: any) {
        console.error('⚠️  RajaOngkir cost API error:', apiError.response?.data || apiError.message);

        // Fallback: return location info
        console.warn('⚠️  Returning location info only');

        return [{
          courier: 'INFO',
          service: 'LOCATION',
          description: `${originCity.type} → ${destCity.type}`,
          cost: 0,
          etd: `${originCity.cityName}, ${originCity.province} → ${destCity.cityName}, ${destCity.province}`,
        }];
      }
    } catch (error: any) {
      console.error('RajaOngkir API error:', error.response?.data || error.message);

      if (error.message.includes('tidak ditemukan')) {
        throw error;
      }

      throw new Error('Gagal mengecek ongkir. Silakan coba lagi.');
    }
  }

  async searchCity(query: string): Promise<City | null> {
    console.log(`🔍 Searching for destination: "${query}"`);

    try {
      // Use new domestic-destination search endpoint
      const response = await this.client.get('/destination/domestic-destination', {
        params: {
          search: query,
          limit: 10,
        },
      });

      console.log(`📡 Search API response status:`, response.status);

      const results = response.data?.data;

      if (!results || results.length === 0) {
        console.log(`❌ No results found for "${query}"`);
        return null;
      }

      // Take the first result (most relevant)
      const firstResult = results[0];

      console.log(`✅ Found destination: ${firstResult.label}`);
      console.log(`   - Subdistrict ID: ${firstResult.id}`);
      console.log(`   - City: ${firstResult.city_name}`);
      console.log(`   - Province: ${firstResult.province_name}`);

      // Map to City interface (using subdistrict ID)
      return {
        cityId: firstResult.id.toString(),
        cityName: firstResult.city_name,
        province: firstResult.province_name,
        type: firstResult.district_name,
        postalCode: firstResult.zip_code || '',
      };
    } catch (error: any) {
      console.error(`❌ Error searching for "${query}":`, error.response?.data || error.message);
      return null;
    }
  }

  async getCities(): Promise<City[]> {
    // NOTE: With the new API, we use direct search instead of caching all cities
    // This method is kept for backwards compatibility but returns empty array
    console.log('ℹ️  getCities() is deprecated - using direct search API instead');
    return [];
  }

  formatShippingCostReply(costs: ShippingCost[]): string {
    if (costs.length === 0) {
      return 'Maaf, tidak ada layanan pengiriman yang tersedia.';
    }

    // Check if this is location info only (not actual costs)
    if (costs.length === 1 && costs[0].courier === 'INFO' && costs[0].service === 'LOCATION') {
      const locationInfo = costs[0];
      const [origin, destination] = locationInfo.etd.split(' → ');

      return `📍 *Pencarian Ongkir*\n\n` +
        `*Asal:* ${origin}\n` +
        `*Tujuan:* ${destination}\n\n` +
        `⚠️ _Fitur cek harga ongkir saat ini sedang dalam perbaikan._\n\n` +
        `Untuk informasi harga ongkir, silakan hubungi admin atau cek langsung di website ekspedisi:\n` +
        `• JNE: jne.co.id\n` +
        `• J&T: jet.co.id\n` +
        `• SiCepat: sicepat.com`;
    }

    let reply = '📦 *Informasi Ongkos Kirim*\n\n';

    // Group by courier
    const groupedByCourier: Record<string, ShippingCost[]> = {};

    for (const cost of costs) {
      if (!groupedByCourier[cost.courier]) {
        groupedByCourier[cost.courier] = [];
      }
      groupedByCourier[cost.courier].push(cost);
    }

    // Format each courier
    for (const [courier, services] of Object.entries(groupedByCourier)) {
      reply += `*${courier.toUpperCase()}*\n`;

      for (const service of services) {
        const formattedCost = this.formatCurrency(service.cost);
        reply += `• ${service.service}: ${formattedCost}\n`;
        reply += `  _${service.description}_\n`;
        reply += `  Estimasi: ${service.etd} hari\n\n`;
      }
    }

    reply += '_Harga sudah termasuk PPN_\n';
    reply += '_Estimasi pengiriman dalam hari kerja_';

    return reply;
  }

  private formatCurrency(amount: number): string {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  }
}

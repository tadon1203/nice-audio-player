export interface AudioOutputDevice {
  id: string;
  name: string;
  isDefault: boolean;
}

export interface AudioDeviceListError {
  code: "enumerationFailed";
}

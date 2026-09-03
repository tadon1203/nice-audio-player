use cpal::traits::{DeviceTrait, HostTrait};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type, PartialEq, Eq)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum AudioOutputSelection {
    SystemDefault,
    Device { device_id: String },
}

#[derive(Debug, Clone, Serialize, specta::Type, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AudioOutputDeviceIdentity {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, specta::Type, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AudioOutputDevice {
    pub id: String,
    pub name: String,
    pub is_default: bool,
}

#[derive(Debug, Clone, Serialize, specta::Type, PartialEq, Eq)]
#[serde(tag = "code", rename_all = "camelCase")]
pub enum AudioDeviceListError {
    EnumerationFailed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum DeviceResolutionError {
    NoDefaultOutputDevice,
    InvalidDeviceId,
    DeviceUnavailable,
}

pub(crate) struct ResolvedAudioOutputDevice {
    pub(crate) device: cpal::Device,
    pub(crate) identity: AudioOutputDeviceIdentity,
}

pub fn list_output_devices() -> Result<Vec<AudioOutputDevice>, AudioDeviceListError> {
    let host = cpal::default_host();
    let default_device_id = host
        .default_output_device()
        .and_then(|device| device.id().ok())
        .map(|id| id.to_string());
    let devices = host
        .output_devices()
        .map_err(|_| AudioDeviceListError::EnumerationFailed)?;

    let mut output_devices = Vec::new();
    for device in devices {
        append_output_device(
            &mut output_devices,
            device.id().map(|id| id.to_string()).map_err(|_| ()),
            device
                .description()
                .map(|description| description.name().to_owned())
                .map_err(|_| ()),
            default_device_id.as_deref(),
        );
    }

    sort_output_devices(&mut output_devices);
    Ok(output_devices)
}

fn append_output_device(
    output: &mut Vec<AudioOutputDevice>,
    id: Result<String, ()>,
    name: Result<String, ()>,
    default_id: Option<&str>,
) {
    let Ok(id) = id else {
        return;
    };
    let Ok(name) = name else {
        return;
    };
    output.push(AudioOutputDevice {
        is_default: default_id == Some(id.as_str()),
        id,
        name,
    });
}

pub(crate) fn resolve_output_selection(
    selection: &AudioOutputSelection,
) -> Result<ResolvedAudioOutputDevice, DeviceResolutionError> {
    let host = cpal::default_host();
    let device = match selection {
        AudioOutputSelection::SystemDefault => host
            .default_output_device()
            .ok_or(DeviceResolutionError::NoDefaultOutputDevice)?,
        AudioOutputSelection::Device { device_id } => {
            if device_id.is_empty() {
                return Err(DeviceResolutionError::InvalidDeviceId);
            }
            let id = device_id
                .parse::<cpal::DeviceId>()
                .map_err(|_| DeviceResolutionError::InvalidDeviceId)?;
            host.device_by_id(&id)
                .ok_or(DeviceResolutionError::DeviceUnavailable)?
        }
    };
    if !device.supports_output() {
        return Err(DeviceResolutionError::DeviceUnavailable);
    }
    let identity =
        device_identity(&device).map_err(|_| DeviceResolutionError::DeviceUnavailable)?;
    Ok(ResolvedAudioOutputDevice { device, identity })
}

pub(crate) fn resolve_output_device_id(
    device_id: &str,
) -> Result<ResolvedAudioOutputDevice, DeviceResolutionError> {
    resolve_output_selection(&AudioOutputSelection::Device {
        device_id: device_id.to_owned(),
    })
}

fn device_identity(device: &cpal::Device) -> Result<AudioOutputDeviceIdentity, cpal::Error> {
    Ok(AudioOutputDeviceIdentity {
        id: device.id()?.to_string(),
        name: device.description()?.name().to_owned(),
    })
}

fn sort_output_devices(devices: &mut [AudioOutputDevice]) {
    devices.sort_by(|left, right| {
        left.name
            .to_lowercase()
            .cmp(&right.name.to_lowercase())
            .then_with(|| left.id.cmp(&right.id))
    });
}

#[cfg(test)]
mod tests {
    use super::{
        append_output_device, sort_output_devices, AudioOutputDevice, AudioOutputSelection,
        DeviceResolutionError,
    };

    fn device(id: &str, name: &str, is_default: bool) -> AudioOutputDevice {
        AudioOutputDevice {
            id: id.to_owned(),
            name: name.to_owned(),
            is_default,
        }
    }

    #[test]
    fn sorts_devices_by_name() {
        let mut devices = vec![
            device("id-b", "Speakers", false),
            device("id-a", "Headphones", true),
        ];

        sort_output_devices(&mut devices);

        assert_eq!(devices[0].name, "Headphones");
        assert_eq!(devices[1].name, "Speakers");
    }

    #[test]
    fn sorts_equal_names_by_id() {
        let mut devices = vec![
            device("id-b", "Speakers", false),
            device("id-a", "Speakers", true),
        ];

        sort_output_devices(&mut devices);

        assert_eq!(devices[0].id, "id-a");
        assert_eq!(devices[1].id, "id-b");
    }

    #[test]
    fn accepts_an_empty_device_list() {
        let mut devices = Vec::new();

        sort_output_devices(&mut devices);

        assert!(devices.is_empty());
    }

    #[test]
    fn serializes_system_default_selection() {
        assert_eq!(
            serde_json::to_value(AudioOutputSelection::SystemDefault).unwrap(),
            serde_json::json!({"kind": "systemDefault"})
        );
    }

    #[test]
    fn serializes_and_round_trips_specific_selection() {
        let selection = AudioOutputSelection::Device {
            device_id: "device-id".into(),
        };
        let value = serde_json::to_value(&selection).unwrap();
        assert_eq!(
            value,
            serde_json::json!({"kind": "device", "deviceId": "device-id"})
        );
        assert_eq!(
            serde_json::from_value::<AudioOutputSelection>(value).unwrap(),
            selection
        );
    }

    #[test]
    fn empty_specific_ids_are_classified_before_device_lookup() {
        match super::resolve_output_selection(&AudioOutputSelection::Device {
            device_id: String::new(),
        }) {
            Err(error) => assert_eq!(error, DeviceResolutionError::InvalidDeviceId),
            Ok(_) => panic!("empty device ID must be rejected"),
        }
    }

    #[test]
    fn appends_only_devices_with_valid_id_and_name() {
        let mut devices = Vec::new();
        append_output_device(
            &mut devices,
            Ok("device-a".into()),
            Ok("Speakers".into()),
            Some("device-a"),
        );
        append_output_device(&mut devices, Err(()), Ok("Ignored".into()), None);
        append_output_device(&mut devices, Ok("device-b".into()), Err(()), None);

        assert_eq!(devices, vec![device("device-a", "Speakers", true)]);
    }
}

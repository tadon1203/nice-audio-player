use cpal::traits::{DeviceTrait, HostTrait};
use serde::Serialize;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AudioOutputDevice {
    pub id: String,
    pub name: String,
    pub is_default: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(tag = "code", rename_all = "camelCase")]
pub enum AudioDeviceListError {
    EnumerationFailed,
}

pub fn list_output_devices() -> Result<Vec<AudioOutputDevice>, AudioDeviceListError> {
    let host = cpal::default_host();
    let default_device_id = host
        .default_output_device()
        .and_then(|device| device.id().ok());
    let devices = host
        .output_devices()
        .map_err(|_| AudioDeviceListError::EnumerationFailed)?;

    let mut output_devices = Vec::new();
    for device in devices {
        let Ok(id) = device.id() else {
            continue;
        };

        output_devices.push(AudioOutputDevice {
            id: id.to_string(),
            name: device.to_string(),
            is_default: default_device_id.as_ref() == Some(&id),
        });
    }

    sort_output_devices(&mut output_devices);
    Ok(output_devices)
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
    use super::{sort_output_devices, AudioOutputDevice};

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
}

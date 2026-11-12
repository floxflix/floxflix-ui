import type { ThemeConfig } from 'antd';

// Colors sampled from src/assets/floxflix.png
const brandColors = {
    primary: '#09c3c2',        // Exact teal used by the logo
    primaryHover: '#2ed3d2',   // Lighter teal for hover states
    primaryActive: '#079e9d',  // Deeper teal for pressed states
    primaryStrong: '#077f7e',  // Surface teal with enough contrast for white text
    accent: '#7be8e6',         // Soft highlight
    onPrimary: '#04201f',      // Readable text/icon on bright teal
};

export const lightTheme: ThemeConfig = {
    token: {
        colorPrimary: brandColors.primary,
        colorSuccess: '#12a594',
        colorWarning: '#f2a93b',
        colorError: '#e5484d',
        colorInfo: brandColors.primary,
        borderRadius: 8,
        colorBgLayout: '#f2f7f7',
        colorBgContainer: '#ffffff',
        colorText: '#10201f',
        colorTextSecondary: '#5a6b6a',
        colorBorder: '#d8e6e5',
        colorBorderSecondary: '#e6efee',
    },
    components: {
        Layout: {
            siderBg: '#0b1c1c',
            headerBg: '#ffffff',
            bodyBg: '#f2f7f7',
        },
        Menu: {
            subMenuItemBg: '#0b1c1c',
            darkItemBg: '#0b1c1c',
            darkItemColor: '#8fa9a8',
            darkItemSelectedColor: '#ffffff',
            darkItemHoverColor: '#e6f2f1',
            itemBg: '#0b1c1c',
            itemSelectedBg: brandColors.primaryStrong,
            itemHoverBg: '#142b2b',
            itemBorderRadius: 6,
        },
        Button: {
            primaryColor: brandColors.onPrimary,
            borderRadius: 8,
        },
        Card: {
            borderRadiusLG: 12,
        },
        Input: {
            borderRadius: 8,
        },
    },
};

export const darkTheme: ThemeConfig = {
    token: {
        colorPrimary: brandColors.primary,
        colorSuccess: '#2ec4a6',
        colorWarning: '#f6b73c',
        colorError: '#f2607a',
        colorInfo: brandColors.primary,
        borderRadius: 8,
        colorBgLayout: '#0b1414',
        colorBgContainer: '#112020',
        colorBgElevated: '#162828',
        colorText: '#e6f2f1',
        colorTextSecondary: '#93a8a7',
        colorBorder: '#1f3636',
        colorBorderSecondary: '#162828',
    },
    components: {
        Layout: {
            siderBg: '#0a1212',
            headerBg: '#112020',
            bodyBg: '#0b1414',
        },
        Menu: {
            subMenuItemBg: '#0a1212',
            darkItemBg: '#0a1212',
            darkItemColor: '#93a8a7',
            darkItemSelectedColor: '#ffffff',
            darkItemHoverColor: '#e6f2f1',
            itemBg: '#0a1212',
            itemSelectedBg: brandColors.primaryStrong,
            itemHoverBg: '#112020',
            itemBorderRadius: 6,
        },
        Button: {
            primaryColor: brandColors.onPrimary,
            borderRadius: 8,
        },
        Card: {
            borderRadiusLG: 12,
            colorBgContainer: '#112020',
        },
        Input: {
            borderRadius: 8,
            colorBgContainer: '#162828',
            colorBorder: '#1f3636',
        },
        Table: {
            colorBgContainer: '#112020',
            headerBg: '#162828',
        },
    },
};

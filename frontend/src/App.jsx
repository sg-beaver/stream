import { Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import SaintHomePage from './pages/SaintHomePage'
import PostListPage from './pages/PostListPage'
import LikedPostsPage from './pages/LikedPostsPage'
import CommonApplicationPage from './pages/CommonApplicationPage'
import PostDetailPage from './pages/PostDetailPage'
import ApplicationFormPage from './pages/ApplicationFormPage'
import ApplicationCompletePage from './pages/ApplicationCompletePage'
import MyApplicationsPage from './pages/MyApplicationsPage'
import ApplicationDetailPage from './pages/ApplicationDetailPage'
import SchedulePage from './pages/SchedulePage'
import SubstitutePage from './pages/SubstitutePage'
import AdminPostsPage from './pages/admin/AdminPostsPage'
import AdminSelectionPage from './pages/admin/AdminSelectionPage'
import AdminStudentsPage from './pages/admin/AdminStudentsPage'
import AdminSchedulePage from './pages/admin/AdminSchedulePage'
import AdminCoursesPage from './pages/admin/AdminCoursesPage'
import AdminSubstitutePage from './pages/admin/AdminSubstitutePage'
import AdminSettingsPage from './pages/admin/AdminSettingsPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/home" element={<SaintHomePage />} />
      <Route path="/posts" element={<PostListPage />} />
      <Route path="/liked" element={<LikedPostsPage />} />
      <Route path="/profile" element={<CommonApplicationPage />} />
      <Route path="/posts/:id" element={<PostDetailPage />} />
      <Route path="/apply" element={<ApplicationFormPage />} />
      <Route path="/apply/complete" element={<ApplicationCompletePage />} />
      <Route path="/applications" element={<MyApplicationsPage />} />
      <Route path="/applications/:id" element={<ApplicationDetailPage />} />
      <Route path="/schedule" element={<SchedulePage />} />
      <Route path="/substitute" element={<SubstitutePage />} />
      <Route path="/admin/posts" element={<AdminPostsPage />} />
      <Route path="/admin/selection" element={<AdminSelectionPage />} />
      <Route path="/admin/students" element={<AdminStudentsPage />} />
      <Route path="/admin/schedule" element={<AdminSchedulePage />} />
      <Route path="/admin/courses" element={<AdminCoursesPage />} />
      <Route path="/admin/substitute" element={<AdminSubstitutePage />} />
      <Route path="/admin/settings" element={<AdminSettingsPage />} />
    </Routes>
  )
}
